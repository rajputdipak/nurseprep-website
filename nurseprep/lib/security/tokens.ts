import { createHmac, timingSafeEqual } from "crypto";

export interface TokenClaims {
  sub: string;
  sid: string;
  did: string;
  role?: string;
  iat: number;
  exp: number;
}

export type VerifyResult =
  | { valid: true; claims: TokenClaims }
  | { valid: false; reason: "missing" | "invalid" | "expired" };

function encode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function sign(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function signJwt(
  claims: Omit<TokenClaims, "iat" | "exp">,
  secret: string,
  ttlSeconds = 900,
  now = Date.now()
): string {
  const iat = Math.floor(now / 1000);
  const exp = iat + ttlSeconds;
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify({ ...claims, iat, exp }));
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;
}

export function verifyJwt(
  token: string | null | undefined,
  secret: string,
  now = Date.now()
): VerifyResult {
  if (!token) return { valid: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "invalid" };

  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, secret));
  const provided = Buffer.from(parts[2]);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "invalid" };
  }

  let claims: TokenClaims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as TokenClaims;
  } catch {
    return { valid: false, reason: "invalid" };
  }
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, claims };
}

export function newRequestId(): string {
  return Buffer.from(
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
  ).toString("hex").slice(0, 32);
}
