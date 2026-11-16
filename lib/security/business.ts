import { logAudit } from "./audit";

export type TenderStatus = "draft" | "published" | "under_evaluation" | "awarded" | "cancelled";

export interface Tender {
  id: string;
  status: TenderStatus;
  deadline: number;
}

export const TENDER_TRANSITIONS: Record<TenderStatus, TenderStatus[]> = {
  draft: ["published"],
  published: ["under_evaluation", "cancelled"],
  under_evaluation: ["awarded", "cancelled"],
  awarded: [],
  cancelled: [],
};

export function transitionTender(tender: Tender, next: TenderStatus): Tender {
  if (!TENDER_TRANSITIONS[tender.status].includes(next)) {
    throw new Error(`Invalid workflow transition: ${tender.status} -> ${next}`);
  }
  return { ...tender, status: next };
}

export function awardTender(tender: Tender): Tender {
  if (tender.status !== "under_evaluation") {
    throw new Error("A tender can only be awarded from under_evaluation");
  }
  return { ...tender, status: "awarded" };
}

export function canSubmitBid(tender: Tender, now = Date.now()): boolean {
  return tender.status === "published" && now <= tender.deadline;
}

export function canWithdrawBid(bid: { deadline: number }, now = Date.now()): boolean {
  return now < bid.deadline;
}

export function assertWithinBudget(amount: number, budget: number): void {
  if (amount <= 0) throw new Error("Payment amount must be positive");
  if (amount > budget) throw new Error("Payment exceeds the available budget");
}

export function releasePayment(input: {
  key: string;
  amount: number;
  budget: number;
  spent: number;
  locks?: Set<string>;
}): { key: string; amount: number; remaining: number } {
  const locks = input.locks ?? new Set<string>();
  if (locks.has(input.key)) throw new Error("Payment is already being processed");
  assertWithinBudget(input.spent + input.amount, input.budget);
  locks.add(input.key);
  return {
    key: input.key,
    amount: input.amount,
    remaining: input.budget - input.spent - input.amount,
  };
}

export function canFileComplaint(countToday: number, limit = 3): boolean {
  return countToday < limit;
}

export function requireFourEyes(input: { makerId: string; approverId: string }): true {
  if (input.makerId === input.approverId) {
    throw new Error("The approver must be different from the maker");
  }
  return true;
}

export function activateBreakGlass(input: {
  actorId: string;
  reason: string;
  minutes: number;
  maxMinutes?: number;
  now?: number;
}): { expiresAt: number } {
  if (!input.reason || input.reason.trim().length < 5) {
    throw new Error("A reason is required for break-glass access");
  }
  const maxMinutes = input.maxMinutes ?? 60;
  if (input.minutes <= 0 || input.minutes > maxMinutes) {
    throw new Error(`Break-glass duration must be between 1 and ${maxMinutes} minutes`);
  }
  const now = input.now ?? Date.now();
  logAudit({
    type: "break_glass_activated",
    actorId: input.actorId,
    severity: "critical",
    details: { reason: input.reason.trim(), minutes: input.minutes },
  });
  return { expiresAt: now + input.minutes * 60_000 };
}

export interface IdempotencyStore {
  results: Map<string, unknown>;
  inFlight: Set<string>;
}

export function createIdempotencyStore(): IdempotencyStore {
  return { results: new Map<string, unknown>(), inFlight: new Set<string>() };
}

export async function withIdempotency<T>(
  store: IdempotencyStore,
  key: string,
  action: () => Promise<T>
): Promise<T> {
  if (store.results.has(key)) return store.results.get(key) as T;
  if (store.inFlight.has(key)) throw new Error("Duplicate request in flight");
  store.inFlight.add(key);
  try {
    const result = await action();
    store.results.set(key, result);
    return result;
  } finally {
    store.inFlight.delete(key);
  }
}

export function requireStepUp(input: {
  lastVerifiedAt: number;
  action: string;
  now?: number;
  maxAgeMs?: number;
}): void {
  const now = input.now ?? Date.now();
  if (now - input.lastVerifiedAt > (input.maxAgeMs ?? 5 * 60_000)) {
    throw new Error(`Step-up verification required for ${input.action}`);
  }
}
