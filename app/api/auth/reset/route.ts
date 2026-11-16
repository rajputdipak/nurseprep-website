import {
  assertSameOrigin, authJson, AuthApiError, clientIp, handleAuthRoute,
  normalizeOtp, readAuthBody,
} from "@/lib/auth-api";
import { clearAttempts, consumeAttempt } from "@/lib/auth-rate-limit";
import { clearOtpCookie, readOtpCookie } from "@/lib/auth-cookies";
import { passwordProblem } from "@/lib/password-policy";
import { createClient } from "@/lib/supabase/server";

function updateError(error: { message?: string } | null): AuthApiError {
  const message = error?.message ?? "";
  if (/nonce|otp|token/i.test(message)) return new AuthApiError(400, "Invalid or expired code. Request a new one.");
  if (/different from the old password/i.test(message)) return new AuthApiError(400, "Choose a password different from your current one");
  return new AuthApiError(400, "Could not update the password. Try a stronger password.");
}

export async function POST(request: Request) {
  return handleAuthRoute(async () => {
    assertSameOrigin(request);
    const pending = readOtpCookie("reset");
    if (!pending) throw new AuthApiError(400, "Your reset session expired. Start again.");
    const body = await readAuthBody(request, ["token", "password"]);
    const token = normalizeOtp(body.token);
    if (!token) throw new AuthApiError(400, "Enter the code from your email");
    if (typeof body.password !== "string") throw new AuthApiError(400, "Enter a new password");
    const problem = passwordProblem(body.password);
    if (problem) throw new AuthApiError(400, problem);

    const attemptKey = `reset:${clientIp(request)}:${pending.email}`;
    if (!consumeAttempt(attemptKey).allowed) {
      throw new AuthApiError(429, "Too many wrong codes. Request a new code or try again later.");
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email: pending.email,
      token,
      type: "email",
    });
    if (error || !data.user) {
      throw new AuthApiError(401, "Invalid or expired code. Request a new one.");
    }

    const { error: passwordError } = await supabase.auth.updateUser({ password: body.password });
    if (passwordError) {
      await supabase.auth.signOut({ scope: "global" });
      throw updateError(passwordError);
    }

    await supabase.auth.signOut({ scope: "global" });
    clearOtpCookie("reset");
    clearAttempts(attemptKey);
    return authJson({ reset: true });
  });
}
