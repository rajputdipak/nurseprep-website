import {
  assertSameOrigin, authJson, AuthApiError, clientIp, handleAuthRoute,
  normalizeOtp, readAuthBody,
} from "@/lib/auth-api";
import { clearAttempts, consumeAttempt } from "@/lib/auth-rate-limit";
import { clearOtpCookie, readOtpCookie } from "@/lib/auth-cookies";
import {
  DEVICE_COOKIE,
  ZT_COOKIE,
  deviceCookieOptions,
  readDevice,
  signDeviceBinding,
  ztCookieOptions,
} from "@/lib/security/device-trust";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  return handleAuthRoute(async () => {
    assertSameOrigin(request);
    const pending = readOtpCookie("login");
    if (!pending) {
      throw new AuthApiError(400, "Your login session expired. Please sign in again.");
    }
    const body = await readAuthBody(request, ["token"]);
    const token = normalizeOtp(body.token);
    if (!token) throw new AuthApiError(400, "Enter the code from your email");

    const attemptKey = `verify:${clientIp(request)}:${pending.email}`;
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

    clearOtpCookie("login");
    clearAttempts(attemptKey);

    // Bind this browser to the new session. /admin requires this token, so the
    // session alone is not enough even if its cookies are copied elsewhere.
    const production = process.env.NODE_ENV === "production";
    const cookieStore = cookies();
    const device = await readDevice(cookieStore.get(DEVICE_COOKIE)?.value);
    if (device.isNew) {
      cookieStore.set(DEVICE_COOKIE, device.value, deviceCookieOptions(production));
    }
    cookieStore.set(
      ZT_COOKIE,
      await signDeviceBinding({ userId: data.user.id, deviceId: device.deviceId }),
      ztCookieOptions(production)
    );

    const { data: profile } = await supabase.from("profiles")
      .select("role").eq("id", data.user.id).maybeSingle();
    console.info("[zt] device token minted", JSON.stringify({
      user: data.user.id.slice(0, 8),
      device: device.deviceId.slice(0, 8),
      newDevice: device.isNew,
      role: profile?.role ?? null,
    }));
    const fallback = profile?.role === "admin" ? "/admin" : "/dashboard";
    return authJson({ next: pending.next || fallback });
  });
}
