import { NextResponse } from "next/server";

export class AuthApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function authJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

// Bound bytes actually consumed instead of trusting Content-Length.
export async function readAuthBody(request: Request, allowedKeys: string[]): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new AuthApiError(400, "Request body required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new AuthApiError(413, "Request body too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some((key) => !allowedKeys.includes(key))) {
      throw new AuthApiError(400, "Invalid request fields");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AuthApiError) throw error;
    throw new AuthApiError(400, "Invalid JSON body");
  } finally {
    reader.releaseLock();
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

// SameSite=Lax cookies already block cross-site POSTs; this rejects mismatched origins too.
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const target = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    || request.headers.get("host");
  let host = "";
  try {
    host = new URL(origin).host;
  } catch {
    throw new AuthApiError(403, "Request blocked");
  }
  if (!target || host !== target) throw new AuthApiError(403, "Request blocked");
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 5 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export function normalizeOtp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.replace(/\s+/g, "");
  return /^[0-9]{6,10}$/.test(token) ? token : null;
}

export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length > 200 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

export function isRateLimitError(error: { status?: number; message?: string } | null): boolean {
  return Boolean(error && (error.status === 429 || /rate limit|too many/i.test(error.message ?? "")));
}

// Unknown addresses must look identical to real ones so these endpoints cannot
// be used to discover which emails have accounts.
export function isUnknownUserError(error: { message?: string } | null): boolean {
  return /user not found|does not exist|not found|signups not allowed/i.test(error?.message ?? "");
}

export async function handleAuthRoute(action: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof AuthApiError) return authJson({ error: error.message }, error.status);
    console.error("[auth] request failed:", error instanceof Error ? error.message : "unknown error");
    return authJson({ error: "Something went wrong. Please try again." }, 500);
  }
}
