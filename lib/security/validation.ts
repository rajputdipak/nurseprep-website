export class ValidationError extends Error {}

const SQL_INJECTION = /(\bor\b|\band\b)\s+['"]?\d+['"]?\s*=\s*['"]?\d+|union\s+(all\s+)?select|;\s*(drop|delete|update|insert)\b|--|\/\*|\bsleep\s*\(|\bbenchmark\s*\(/i;
const SHELL_METACHARACTERS = /[;&|`$<>\n\r]/;

export function assertSqlSafe(value: unknown, field = "input"): void {
  if (typeof value !== "string") return;
  if (SQL_INJECTION.test(value)) throw new ValidationError(`${field} contains unsafe SQL characters`);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeStoredText(value: string): string {
  return escapeHtml(value).replace(/\u0000/g, "");
}

export function assertNoPrototypePollution(value: unknown, field = "payload"): void {
  if (!value || typeof value !== "object") return;
  const keys = Object.keys(value as Record<string, unknown>);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new ValidationError(`${field} contains a forbidden key: ${key}`);
    }
    assertNoPrototypePollution((value as Record<string, unknown>)[key], field);
  }
}

export function assertJsonDepth(value: unknown, maxDepth = 8, field = "payload"): void {
  const walk = (node: unknown, depth: number) => {
    if (depth > maxDepth) throw new ValidationError(`${field} is nested too deeply`);
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, depth + 1));
      return;
    }
    if (node && typeof node === "object") {
      Object.keys(node as Record<string, unknown>).forEach((key) =>
        walk((node as Record<string, unknown>)[key], depth + 1)
      );
    }
  };
  walk(value, 1);
}

export function pickAllowed(
  input: Record<string, unknown>,
  allowed: string[]
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("payload must be an object");
  }
  const output: Record<string, unknown> = {};
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(input, key)) output[key] = input[key];
  });
  return output;
}

export function assertSafeRelativePath(relative: string): string {
  if (!relative || relative.startsWith("/") || relative.startsWith("\\")) {
    throw new ValidationError("Absolute paths are not allowed");
  }
  if (/^[a-zA-Z]:/.test(relative)) throw new ValidationError("Drive-qualified paths are not allowed");
  if (relative.split(/[\\/]/).some((part) => part === ".." || part === ".")) {
    throw new ValidationError("Path traversal is not allowed");
  }
  if (relative.includes("\u0000")) throw new ValidationError("Invalid path");
  return relative;
}

export function assertSafeShellArg(value: string): void {
  if (SHELL_METACHARACTERS.test(value) || value.includes("$(")) {
    throw new ValidationError("Shell metacharacters are not allowed");
  }
}

export function isPrivateIp(host: string): boolean {
  const cleaned = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (cleaned === "localhost" || cleaned.endsWith(".localhost")) return true;
  if (cleaned === "metadata.google.internal") return true;
  if (cleaned.includes(":")) {
    return (
      cleaned === "::1" ||
      cleaned === "::" ||
      cleaned.startsWith("fc") ||
      cleaned.startsWith("fd") ||
      cleaned.startsWith("fe80")
    );
  }
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(cleaned);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function assertSafeOutboundUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("Only http(s) URLs are allowed");
  }
  if (isPrivateIp(url.hostname)) {
    throw new ValidationError("Outbound requests to private addresses are blocked");
  }
  return url;
}

export function parseJsonSecure(text: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ValidationError("Invalid JSON");
  }
  assertNoPrototypePollution(parsed);
  assertJsonDepth(parsed);
  return parsed;
}

export function rejectDuplicateQuery(url: string): string[] {
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  const seen = new Set<string>();
  const keys: string[] = [];
  if (query) {
    query.split("&").forEach((pair) => {
      const rawKey = pair.split("=")[0] ?? "";
      if (!rawKey) return;
      const key = decodeURIComponent(rawKey);
      if (seen.has(key)) throw new ValidationError(`Duplicate query parameter: ${key}`);
      seen.add(key);
      keys.push(key);
    });
  }
  return keys;
}

export type FileKind = "pdf" | "png" | "jpeg";

export function sniffType(buffer: Buffer): FileKind | "unknown" {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  return "unknown";
}

export function assertMagicBytes(buffer: Buffer, expected: FileKind): void {
  const actual = sniffType(buffer);
  if (actual !== expected) {
    throw new ValidationError(`File content does not match ${expected.toUpperCase()}`);
  }
}

export function assertUploadSize(bytes: number, maxBytes = 5 * 1024 * 1024): void {
  if (bytes <= 0) throw new ValidationError("Empty file");
  if (bytes > maxBytes) throw new ValidationError("File is too large");
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function assertNoXxe(xml: string): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new ValidationError("XML external entities are not allowed");
  }
}

export function publicAuthError(): string {
  return "Invalid email or password";
}

export function publicResetMessage(): string {
  return "If that email has an account, a reset code is on its way.";
}
