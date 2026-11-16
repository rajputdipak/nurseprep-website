import {
  assertSameOrigin, authJson, AuthApiError, clientIp, handleAuthRoute, isRateLimitError,
  isUnknownUserError, normalizeEmail, readAuthBody,
} from "@/lib/auth-api";
import { consumeAttempt, inCooldown, startCooldown } from "@/lib/auth-rate-limit";
import { setOtpCookie } from "@/lib/auth-cookies";
import { createClient } from "@/lib/supabase/server";

// Always answer generically so the endpoint cannot be used to discover accounts.
export async function POST(request: Request) {
  return handleAuthRoute(async () => {
    assertSameOrigin(request);
    const body = await readAuthBody(request, ["email"]);
    const email = normalizeEmail(body.email);
    if (!email) throw new AuthApiError(400, "Enter a valid email address");

    const ip = clientIp(request);
    if (!consumeAttempt(`forgot:${ip}:${email}`, 5, 15 * 60_000).allowed) {
      throw new AuthApiError(429, "Too many requests. Try again in a few minutes.");
    }
    if (inCooldown(`otp-send:${email}`)) {
      throw new AuthApiError(429, "A code was just sent. Check your email or wait a minute.");
    }

    const supabase = createClient();
    startCooldown(`otp-send:${email}`);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) {
      if (isRateLimitError(error)) {
        throw new AuthApiError(429, "Too many codes requested. Try again later.");
      }
      if (!isUnknownUserError(error)) {
        console.error("[auth] reset OTP email failed:", error.message);
        throw new AuthApiError(502, "Could not send the reset code. Please try again.");
      }
    }

    setOtpCookie("reset", email);
    return authJson({ sent: true, email });
  });
}
