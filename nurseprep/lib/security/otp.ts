import { createHash, randomInt } from "crypto";

export type OtpPurpose = "login" | "reset" | "public";
export type AccountType = "staff" | "citizen";

export type OtpFailure =
  | "missing"
  | "expired"
  | "used"
  | "too_many"
  | "mismatch"
  | "staff_account";

interface OtpEntry {
  purpose: OtpPurpose;
  identifier: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  used: boolean;
}

const entries = new Map<string, OtpEntry>();
const accounts = new Map<string, AccountType>();

function key(purpose: OtpPurpose, identifier: string): string {
  return `${purpose}:${identifier.toLowerCase()}`;
}

function hash(identifier: string, code: string): string {
  return createHash("sha256").update(`${identifier.toLowerCase()}:${code}`).digest("hex");
}

export function resetOtp(): void {
  entries.clear();
  accounts.clear();
}

export function registerAccount(email: string, type: AccountType): void {
  accounts.set(email.toLowerCase(), type);
}

export function issueOtp(input: {
  purpose: OtpPurpose;
  identifier: string;
  ttlMs?: number;
  length?: number;
  now?: number;
  send?: (message: { to: string; code: string; purpose: OtpPurpose }) => void;
}): { code: string; expiresAt: number } {
  const now = input.now ?? Date.now();
  const identifier = input.identifier.toLowerCase();
  if (input.purpose === "public" && accounts.get(identifier) === "staff") {
    throw new Error("Public OTP cannot be issued for staff accounts");
  }
  const length = input.length ?? 6;
  const code = String(randomInt(0, 10 ** length)).padStart(length, "0");
  const expiresAt = now + (input.ttlMs ?? 10 * 60_000);
  entries.set(key(input.purpose, identifier), {
    purpose: input.purpose,
    identifier,
    codeHash: hash(identifier, code),
    expiresAt,
    attempts: 0,
    used: false,
  });
  if (input.send) input.send({ to: identifier, code, purpose: input.purpose });
  return { code, expiresAt };
}

export function verifyOtp(input: {
  purpose: OtpPurpose;
  identifier: string;
  code: string;
  now?: number;
  maxAttempts?: number;
}): { ok: boolean; reason?: OtpFailure } {
  const now = input.now ?? Date.now();
  const entry = entries.get(key(input.purpose, input.identifier));
  if (!entry) return { ok: false, reason: "missing" };
  if (entry.used) return { ok: false, reason: "used" };
  if (entry.expiresAt <= now) {
    entry.used = true;
    return { ok: false, reason: "expired" };
  }
  if (entry.attempts >= (input.maxAttempts ?? 5)) {
    return { ok: false, reason: "too_many" };
  }
  if (hash(input.identifier, input.code) !== entry.codeHash) {
    entry.attempts += 1;
    return { ok: false, reason: "mismatch" };
  }
  entry.used = true;
  return { ok: true };
}

export function accountType(email: string): AccountType | "unknown" {
  return accounts.get(email.toLowerCase()) ?? "unknown";
}
