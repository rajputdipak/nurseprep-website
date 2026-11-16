import {
  assertSameOrigin, authJson, AuthApiError, clientIp, handleAuthRoute, normalizeOtp, readAuthBody,
} from "@/lib/auth-api";
import { clearAttempts, consumeAttempt } from "@/lib/auth-rate-limit";
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
    const body = await readAuthBody(request, ["nonce", "password"]);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthApiError(401, "Sign in to change your password");

    const nonce = normalizeOtp(body.nonce);
    if (!nonce) throw new AuthApiError(400, "Enter the code from your email");
    if (typeof body.password !== "string") throw new AuthApiError(400, "Enter a new password");
    const problem = passwordProblem(body.password);
    if (problem) throw new AuthApiError(400, problem);

    const attemptKey = `change:${clientIp(request)}:${user.id}`;
    if (!consumeAttempt(attemptKey).allowed) {
      throw new AuthApiError(429, "Too many wrong codes. Request a new code or try again later.");
    }

    const { error } = await supabase.auth.updateUser({ password: body.password, nonce });
    if (error) throw updateError(error);

    await supabase.auth.signOut({ scope: "others" });
    clearAttempts(attemptKey);
    return authJson({ updated: true });
  });
}
