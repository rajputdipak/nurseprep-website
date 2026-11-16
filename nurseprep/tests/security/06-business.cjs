const { test, assert, load, afterEach } = require("./harness.cjs");

const business = load("lib/security/business.ts");
const audit = load("lib/security/audit.ts");

afterEach(() => audit.resetAudit());

function tender(status, deadline = 10_000) {
  return { id: "tender-1", status, deadline };
}

test("test_tender_award_only_from_under_evaluation", () => {
  assert.throws(() => business.awardTender(tender("published")), /under_evaluation/);
  const awarded = business.awardTender(tender("under_evaluation"));
  assert.equal(awarded.status, "awarded");
});

test("test_bid_cannot_be_submitted_after_deadline", () => {
  assert.equal(business.canSubmitBid(tender("published", 1000), 500), true);
  assert.equal(business.canSubmitBid(tender("published", 1000), 2000), false);
});

test("test_bid_cannot_be_withdrawn_after_deadline", () => {
  assert.equal(business.canWithdrawBid({ deadline: 1000 }, 500), true);
  assert.equal(business.canWithdrawBid({ deadline: 1000 }, 1001), false);
});

test("test_workflow_state_transition_invalid_rejected", () => {
  assert.throws(() => business.transitionTender(tender("draft"), "awarded"), /Invalid workflow/);
  const published = business.transitionTender(tender("draft"), "published");
  assert.equal(published.status, "published");
});

test("test_payment_exceeds_budget_rejected", () => {
  assert.throws(() => business.assertWithinBudget(150, 100), /exceeds/);
  assert.doesNotThrow(() => business.assertWithinBudget(100, 100));
});

test("test_race_condition_double_payment_prevented", () => {
  const locks = new Set();
  const first = business.releasePayment({
    key: "payment-1",
    amount: 100,
    budget: 1000,
    spent: 0,
    locks,
  });
  assert.equal(first.remaining, 900);
  assert.throws(
    () =>
      business.releasePayment({
        key: "payment-1",
        amount: 100,
        budget: 1000,
        spent: 0,
        locks,
      }),
    /already being processed/
  );
});

test("test_idempotency_key_prevents_duplicate_requests", async () => {
  const store = business.createIdempotencyStore();
  let executions = 0;
  const action = async () => {
    executions += 1;
    return { ok: true, executions };
  };
  const first = await business.withIdempotency(store, "idem-1", action);
  const second = await business.withIdempotency(store, "idem-1", action);
  assert.equal(executions, 1);
  assert.deepEqual(first, second);
});

test("test_complaint_daily_limit_enforced", () => {
  assert.equal(business.canFileComplaint(2, 3), true);
  assert.equal(business.canFileComplaint(3, 3), false);
});

test("test_four_eyes_self_approval_denied", () => {
  assert.throws(
    () => business.requireFourEyes({ makerId: "user-1", approverId: "user-1" }),
    /different from the maker/
  );
});

test("test_four_eyes_requires_different_approver", () => {
  assert.equal(
    business.requireFourEyes({ makerId: "user-1", approverId: "user-2" }),
    true
  );
});

test("test_break_glass_activation_logs_critical_event", () => {
  business.activateBreakGlass({ actorId: "admin-1", reason: "incident recovery", minutes: 30 });
  const entry = audit.getAuditEntries().find((item) => item.type === "break_glass_activated");
  assert.ok(entry);
  assert.equal(entry.severity, "critical");
  assert.equal(entry.actorId, "admin-1");
});

test("test_break_glass_requires_reason", () => {
  assert.throws(
    () => business.activateBreakGlass({ actorId: "admin-1", reason: "", minutes: 10 }),
    /reason is required/
  );
});

test("test_break_glass_max_duration_enforced", () => {
  assert.throws(
    () => business.activateBreakGlass({ actorId: "admin-1", reason: "incident", minutes: 61 }),
    /between 1 and 60/
  );
  assert.doesNotThrow(() =>
    business.activateBreakGlass({ actorId: "admin-1", reason: "incident", minutes: 60 })
  );
});

test("test_step_up_required_for_password_change", () => {
  const now = 1_000_000;
  assert.throws(
    () =>
      business.requireStepUp({
        lastVerifiedAt: now - 10 * 60_000,
        action: "password change",
        now,
      }),
    /Step-up verification required/
  );
  assert.doesNotThrow(() =>
    business.requireStepUp({ lastVerifiedAt: now - 60_000, action: "password change", now })
  );
});

test("test_step_up_required_for_payment_release", () => {
  const now = 1_000_000;
  assert.throws(
    () =>
      business.requireStepUp({
        lastVerifiedAt: now - 30 * 60_000,
        action: "payment release",
        now,
      }),
    /payment release/
  );
  assert.doesNotThrow(() =>
    business.requireStepUp({ lastVerifiedAt: now - 30_000, action: "payment release", now })
  );
});
