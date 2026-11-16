import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export type OtpPurpose = "login" | "reset";

const MAX_AGE_SECONDS = 600;
const COOKIE_NAME: Record<OtpPurpose, string> = {
  login: "np_login_otp",
  reset: "np_reset_otp",
};

// The cookie only carries which email may be verified; the emailed OTP is still required.
function cookieSecret(): string {
  return process.env.AUTH_OTP_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || "nurseprep-otp-cookie";
}

function sign(payload: string): string {
  return createHmac("sha256", cookieSecret()).update(payload).digest("base64url");
}

function encode(data: object): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(value: string): Record<string, unknown> | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const provided = Buffer.from(signature);
  const expected = Buffer.from(sign(payload));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data && typeof data === "object" ? data as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function setOtpCookie(purpose: OtpPurpose, email: string, next?: string | null) {
  const data: Record<string, unknown> = { p: purpose, e: email, x: Date.now() + MAX_AGE_SECONDS * 1000 };
  if (next) data.n = next;
  cookies().set(COOKIE_NAME[purpose], encode(data), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function readOtpCookie(purpose: OtpPurpose): { email: string; next: string | null } | null {
  const raw = cookies().get(COOKIE_NAME[purpose])?.value;
  if (!raw) return null;
  const data = decode(raw);
  if (!data || data.p !== purpose) return null;
  if (typeof data.e !== "string" || typeof data.x !== "number" || data.x < Date.now()) return null;
  return { email: data.e, next: typeof data.n === "string" ? data.n : null };
}

export function clearOtpCookie(purpose: OtpPurpose) {
  cookies().delete(COOKIE_NAME[purpose]);
}
