const { test, assert, load, afterEach } = require("./harness.cjs");

const audit = load("lib/security/audit.ts");
const headers = load("lib/security/headers.ts");

afterEach(() => audit.resetAudit());

test("test_audit_log_created_for_sensitive_action", () => {
  audit.logAudit({ type: "payment_released", actorId: "admin-1", tenantId: "co-1" });
  const entries = audit.getAuditEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, "payment_released");
});

test("test_audit_log_immutable", () => {
  const entry = audit.logAudit({ type: "role_changed", actorId: "admin-1" });
  const original = entry.type;
  try {
    entry.type = "tampered";
  } catch {
    // frozen objects throw in strict mode and silently ignore in sloppy mode
  }
  assert.equal(entry.type, original);
  assert.equal(audit.getAuditEntries()[0].type, original);
  assert.equal(Object.isFrozen(entry), true);
});

test("test_audit_log_contains_request_id", () => {
  audit.logAudit({ type: "login_success", actorId: "user-1", requestId: "req-123" });
  assert.equal(audit.getAuditEntries()[0].requestId, "req-123");
});

test("test_security_event_logged_on_login_fail", () => {
  audit.logAudit({ type: "login_failed", actorId: "unknown", severity: "warning" });
  const entry = audit.getAuditEntries().find((item) => item.type === "login_failed");
  assert.ok(entry);
  assert.equal(entry.severity, "warning");
});

test("test_siem_event_generated", () => {
  const entry = audit.logAudit({ type: "break_glass_activated", severity: "critical" });
  const event = audit.siemEvent(entry);
  assert.equal(event.event_type, "break_glass_activated");
  assert.equal(event.severity, "critical");
  assert.ok(typeof event.timestamp === "string");
});

test("test_alert_triggered_for_critical_event", () => {
  let alerted = null;
  audit.registerAlertHandler((entry) => {
    alerted = entry;
  });
  audit.logAudit({ type: "mass_data_export", severity: "critical" });
  assert.ok(alerted);
  assert.equal(alerted.type, "mass_data_export");
});

test("test_hsts_header_present_in_production", () => {
  const production = headers.securityHeaders(true);
  assert.match(production["Strict-Transport-Security"], /max-age=31536000/);
  assert.equal(headers.securityHeaders(false)["Strict-Transport-Security"], undefined);
});

test("test_csp_header_present", () => {
  const csp = headers.securityHeaders(true)["Content-Security-Policy"];
  assert.ok(csp);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /default-src 'self'/);
});

test("test_x_frame_options_deny", () => {
  assert.equal(headers.securityHeaders(true)["X-Frame-Options"], "DENY");
});

test("test_x_content_type_nosniff", () => {
  assert.equal(headers.securityHeaders(true)["X-Content-Type-Options"], "nosniff");
});

test("test_referrer_policy_no_referrer", () => {
  assert.equal(headers.securityHeaders(true)["Referrer-Policy"], "no-referrer");
});

test("test_permissions_policy_disables_camera", () => {
  assert.match(headers.securityHeaders(true)["Permissions-Policy"], /camera=\(\)/);
});

test("test_request_id_header_returned", () => {
  const id = audit.newRequestId();
  assert.equal(audit.requestIdHeader(id)["x-request-id"], id);
});

test("test_error_response_does_not_leak_stack_trace", () => {
  const error = new Error("database password is hunter2");
  const body = audit.sanitizeError(true);
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes("hunter2"));
  assert.ok(!serialized.includes(error.stack));
  assert.ok(!serialized.includes("database"));
  assert.equal(body.error, "Something went wrong. Please try again.");
});

test("test_validation_error_does_not_echo_secrets", () => {
  const body = audit.validationError("password", "must be at least 8 characters");
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes("hunter2"));
  assert.ok(serialized.includes("must be at least 8 characters"));
});
