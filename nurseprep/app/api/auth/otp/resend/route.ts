import {
  assertSameOrigin, authJson, AuthApiError, clientIp, handleAuthRoute, isRateLimitError,
  isUnknownUserError, readAuthBody,
} from "@/lib/auth-api";
import { consumeAttempt, endCooldown, inCooldown, startCooldown } from "@/lib/auth-rate-limit";
import { readOtpCookie, setOtpCookie } from "@/lib/auth-cookies";
import { createClient } from "@/lib/supabase/server";

// Resends the code for whichever pending flow the signed cookie belongs to.
export async function POST(request: Request) {
  return handleAuthRoute(async () => {
    assertSameOrigin(request);
    await readAuthBody(request, []);

    const login = readOtpCookie("login");
    const reset = login ? null : readOtpCookie("reset");
    const pending = login
      ? { purpose: "login" as const, email: login.email, next: login.next }
      : reset
        ? { purpose: "reset" as const, email: reset.email, next: null }
        : null;
    if (!pending) throw new AuthApiError(400, "Your session expired. Start again.");

    if (!consumeAttempt(`resend:${clientIp(request)}:${pending.email}`).allowed) {
      throw new AuthApiError(429, "Too many requests. Try again in a few minutes.");
    }
    const cooldownKey = `otp-send:${pending.email}`;
    if (inCooldown(cooldownKey)) {
      throw new AuthApiError(429, "Please wait a minute before requesting another code.");
    }

    startCooldown(cooldownKey);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: pending.email,
      options: { shouldCreateUser: false },
    });
    if (error) {
      if (isRateLimitError(error)) {
        endCooldown(cooldownKey);
        throw new AuthApiError(429, "Too many codes requested. Try again later.");
      }
      if (!isUnknownUserError(error)) {
        endCooldown(cooldownKey);
        console.error("[auth] resend OTP email failed:", error.message);
        throw new AuthApiError(502, "Could not send the code. Please try again.");
      }
    }

    setOtpCookie(pending.purpose, pending.email, pending.next);
    return authJson({ sent: true });
  });
}
