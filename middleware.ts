import { updateSession } from "@/lib/supabase/middleware";
import { securityHeaders } from "@/lib/security/headers";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  const incoming = request.headers.get("x-request-id");
  const requestId = incoming && incoming.length <= 64 ? incoming : crypto.randomUUID();
  response.headers.set("x-request-id", requestId);

  // CSP and HSTS stay out of development so the HMR runtime keeps working.
  if (process.env.NODE_ENV === "production") {
    const headers = securityHeaders(true);
    Object.keys(headers).forEach((name) => response.headers.set(name, headers[name]));
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webc|webp|ico)$).*)",
  ],
};