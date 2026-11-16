import { verifyJwt } from "./tokens";

export const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/jobs",
  "/tenders",
  "/api/public",
];

export const STATIC_PREFIXES = [
  "/_next/static/",
  "/_next/image",
  "/favicon.ico",
  "/images/",
  "/assets/",
];

export interface ZeroTrustInput {
  path: string;
  token?: string | null;
  secret: string;
  deviceId?: string;
  now?: number;
  riskScore?: number;
}

export interface ZeroTrustResult {
  ok: boolean;
  status: number;
  reason?: string;
  claims?: unknown;
}

export function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  return PUBLIC_PATHS.some((allowed) => allowed !== "/" && path.startsWith(`${allowed}/`));
}

export function isStaticAsset(path: string): boolean {
  return STATIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

export function zeroTrustGuard(input: ZeroTrustInput): ZeroTrustResult {
  if (isStaticAsset(input.path)) return { ok: true, status: 200, reason: "static" };
  if (isPublicPath(input.path)) return { ok: true, status: 200, reason: "public" };

  const result = verifyJwt(input.token, input.secret, input.now ?? Date.now());
  if (!result.valid) {
    return { ok: false, status: 401, reason: result.reason };
  }
  if (input.deviceId && result.claims.did !== input.deviceId) {
    return { ok: false, status: 401, reason: "device_mismatch" };
  }
  if ((input.riskScore ?? 0) >= 90) {
    return { ok: false, status: 403, reason: "critical_risk" };
  }
  return { ok: true, status: 200, claims: result.claims };
}
