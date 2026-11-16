import { randomUUID } from "crypto";

export function issueCsrfToken(): string {
  return randomUUID();
}

export function verifyCsrf(input: {
  cookieToken?: string | null;
  headerToken?: string | null;
}): { ok: boolean; reason?: string } {
  if (!input.cookieToken) return { ok: false, reason: "missing_cookie" };
  if (!input.headerToken) return { ok: false, reason: "missing_header" };
  if (input.cookieToken !== input.headerToken) return { ok: false, reason: "mismatch" };
  return { ok: true };
}
