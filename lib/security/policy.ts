import { timingSafeEqual } from "crypto";

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function passwordChangeAllowed(input: {
  currentPassword: string;
  storedPassword: string;
}): boolean {
  if (!input.currentPassword || !constantTimeEqual(input.currentPassword, input.storedPassword)) {
    throw new Error("Current password is incorrect");
  }
  return true;
}

export function mfaRequired(role: string): boolean {
  return role === "admin" || role === "super_admin" || role === "gov_admin";
}

export function assertMfaSatisfied(role: string, verified: boolean): void {
  if (mfaRequired(role) && !verified) {
    throw new Error("MFA verification required");
  }
}

export function hasRecentStepUp(input: {
  lastVerifiedAt: number;
  now?: number;
  maxAgeMs?: number;
}): boolean {
  const now = input.now ?? Date.now();
  return now - input.lastVerifiedAt <= (input.maxAgeMs ?? 5 * 60_000);
}
