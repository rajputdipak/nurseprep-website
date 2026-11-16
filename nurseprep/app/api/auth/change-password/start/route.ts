import {
  assertSameOrigin, authJson, AuthApiError, handleAuthRoute, isRateLimitError, readAuthBody,
} from "@/lib/auth-api";
import { endCooldown, inCooldown, startCooldown } from "@/lib/auth-rate-limit";
import { createClient } from "@/lib/supabase/server";

// Supabase emails a reauthentication nonce; the password only changes once
// that nonce is presented back.
export async function POST(request: Request) {
  return handleAuthRoute(async () => {
    assertSameOrigin(request);
    await readAuthBody(request, []);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthApiError(401, "Sign in to change your password");

    const cooldownKey = `otp-send:cp:${user.id}`;
    if (inCooldown(cooldownKey)) {
      throw new AuthApiError(429, "A code was just sent. Check your email or wait a minute.");
    }

    startCooldown(cooldownKey);
    const { error } = await supabase.auth.reauthenticate();
    if (error) {
      endCooldown(cooldownKey);
      if (isRateLimitError(error)) {
        throw new AuthApiError(429, "Too many codes requested. Try again later.");
      }
      console.error("[auth] reauthentication failed:", error.message);
      throw new AuthApiError(502, "Could not send the verification code. Please try again.");
    }

    return authJson({ sent: true });
  });
}
