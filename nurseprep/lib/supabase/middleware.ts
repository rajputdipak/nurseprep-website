import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  DEVICE_COOKIE,
  ZT_COOKIE,
  deviceCookieOptions,
  readDevice,
  verifyDeviceBinding,
} from "@/lib/security/device-trust";

const PROTECTED = ["/dashboard", "/exam", "/test", "/result", "/admin", "/account", "/payments"];
const AUTH_PAGES = ["/login", "/register"];

export async function updateSession(request: NextRequest) {
  const production = process.env.NODE_ENV === "production";
  const device = await readDevice(request.cookies.get(DEVICE_COOKIE)?.value);
  const withDevice = (response: NextResponse) => {
    if (device.isNew) {
      response.cookies.set(DEVICE_COOKIE, device.value, deviceCookieOptions(production));
    }
    return response;
  };

  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) return withDevice(response);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && PROTECTED.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return withDevice(NextResponse.redirect(url));
  }

  const isAdminPage = path === "/admin" || path.startsWith("/admin/");
  const isAdminApi = path === "/api/admin" || path.startsWith("/api/admin/");
  const isAdminArea = isAdminPage || isAdminApi;
  // Exact match only: /login/verify must stay reachable for an already
  // signed-in admin completing device re-authentication.
  const isAuthPage = AUTH_PAGES.includes(path);
  const isReauthLogin =
    path === "/login" && request.nextUrl.searchParams.get("reauth") === "1";

  if (isAdminApi && !user) {
    return withDevice(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  if (user && (isAdminArea || isAuthPage)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    // Fail closed: a missing or errored profile never grants admin access.
    if (isAdminArea && profile?.role !== "admin") {
      console.warn("[zt] admin role check failed", JSON.stringify({
        path, role: profile?.role ?? null, user: user.id.slice(0, 8),
      }));
      if (isAdminApi) {
        return withDevice(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
      }
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return withDevice(NextResponse.redirect(url));
    }

    // Zero trust for the admin area: the device-bound token is minted only after
    // a successful emailed-OTP login, so a copied session cookie on another
    // browser cannot reach /admin.
    if (isAdminArea) {
      const bound = await verifyDeviceBinding(
        request.cookies.get(ZT_COOKIE)?.value,
        user.id,
        device.deviceId
      );
      if (!bound) {
        console.warn("[zt] admin device binding failed", JSON.stringify({
          path,
          user: user.id.slice(0, 8),
          hasToken: Boolean(request.cookies.get(ZT_COOKIE)?.value),
          device: device.deviceId.slice(0, 8),
          newDevice: device.isNew,
        }));
        if (isAdminApi) {
          return withDevice(
            NextResponse.json(
              { error: "Re-authentication required", code: "reauth_required" },
              { status: 401 }
            )
          );
        }
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.search = "";
        url.searchParams.set("reauth", "1");
        url.searchParams.set("next", path);
        return withDevice(NextResponse.redirect(url));
      }
    }

    // /login?reauth=1 stays reachable so an already signed-in admin can complete
    // the step-up login that mints the device-bound token.
    if (isAuthPage && !isReauthLogin) {
      const url = request.nextUrl.clone();
      url.pathname = profile?.role === "admin" ? "/admin" : "/dashboard";
      url.search = "";
      return withDevice(NextResponse.redirect(url));
    }
  }

  return withDevice(response);
}
