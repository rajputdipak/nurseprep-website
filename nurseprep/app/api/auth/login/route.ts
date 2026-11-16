import {
  assertSameOrigin, authJson, AuthApiError, clientIp, handleAuthRoute, isRateLimitError,
  normalizeEmail, readAuthBody, safeNextPath,
} from "@/lib/auth-api";
import { clearAttempts, consumeAttempt, endCooldown, inCooldown, startCooldown } from "@/lib/auth-rate-limit";
import { setOtpCookie } from "@/lib/auth-cookies";
import { createClient } from "@/lib/supabase/server";

// Password is checked first. The session is discarded and only a successful
// emailed OTP establishes the real session.
export async function POST(request: Request) {
  return handleAuthRoute(async () => {
    assertSameOrigin(request);
    const body = await readAuthBody(request, ["email", "password", "next"]);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) throw new AuthApiError(400, "Enter your email and password");
    if (password.length > 200) throw new AuthApiError(401, "Invalid email or password");

    const ip = clientIp(request);
    const attemptKey = `login:${ip}:${email}`;
    if (!consumeAttempt(attemptKey).allowed) {
      throw new AuthApiError(429, "Too many login attempts. Try again in a few minutes.");
    }
    if (inCooldown(`otp-send:${email}`)) {
      throw new AuthApiError(429, "A login code was just sent. Check your email or wait a minute.");
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      if (error && /email not confirmed/i.test(error.message)) {
        throw new AuthApiError(403, "Confirm your email first — check your inbox.");
      }
      if (isRateLimitError(error)) {
        throw new AuthApiError(429, "Too many attempts. Try again in a few minutes.");
      }
      throw new AuthApiError(401, "Invalid email or password");
    }

    await supabase.auth.signOut({ scope: "local" });
    clearAttempts(attemptKey);
    startCooldown(`otp-send:${email}`);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (otpError) {
      endCooldown(`otp-send:${email}`);
      if (isRateLimitError(otpError)) {
        throw new AuthApiError(429, "Too many codes requested. Try again later.");
      }
      console.error("[auth] login OTP email failed:", otpError.message);
      throw new AuthApiError(502, "Could not send the login code. Please try again.");
    }

    setOtpCookie("login", email, safeNextPath(body.next));
    return authJson({ otp_sent: true, email });
  });
}
