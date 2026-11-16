// Edge-safe (Web Crypto) device identity + admin binding. No Node built-ins here:
// this module is imported by middleware, which runs on the edge runtime.

export const DEVICE_COOKIE = "np_device";
export const ZT_COOKIE = "np_zt";
export const DEVICE_MAX_AGE = 60 * 60 * 24 * 365;
export const ZT_MAX_AGE = 60 * 60 * 12;

export interface DeviceCookie {
  deviceId: string;
  value: string;
  isNew: boolean;
}

function cookieSecret(): string {
  return (
    process.env.AUTH_OTP_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "nurseprep-device-cookie"
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(cookieSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayload(payload: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    new TextEncoder().encode(payload)
  );
  return toBase64Url(new Uint8Array(signature));
}

async function verifyPayload(payload: string, signature: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      fromBase64Url(signature) as unknown as BufferSource,
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

export function deviceCookieOptions(production: boolean): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_MAX_AGE,
  };
}

export function ztCookieOptions(production: boolean): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: ZT_MAX_AGE,
  };
}

// A valid signed cookie names the browser; anything tampered with is replaced.
export async function readDevice(value: string | undefined | null): Promise<DeviceCookie> {
  if (value) {
    const [deviceId, signature] = value.split(".");
    if (deviceId && signature && (await verifyPayload(deviceId, signature))) {
      return { deviceId, value, isNew: false };
    }
  }
  const deviceId = crypto.randomUUID();
  return { deviceId, value: `${deviceId}.${await signPayload(deviceId)}`, isNew: true };
}

export async function signDeviceBinding(input: {
  userId: string;
  deviceId: string;
  now?: number;
  ttlSeconds?: number;
}): Promise<string> {
  const expires = Math.floor((input.now ?? Date.now()) / 1000) + (input.ttlSeconds ?? ZT_MAX_AGE);
  const payload = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ u: input.userId, d: input.deviceId, e: expires }))
  );
  return `${payload}.${await signPayload(payload)}`;
}

export async function verifyDeviceBinding(
  token: string | undefined | null,
  userId: string,
  deviceId: string,
  now = Date.now()
): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  if (!(await verifyPayload(payload, signature))) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
      u?: unknown;
      d?: unknown;
      e?: unknown;
    };
    return (
      data.u === userId &&
      data.d === deviceId &&
      typeof data.e === "number" &&
      data.e * 1000 > now
    );
  } catch {
    return false;
  }
}
