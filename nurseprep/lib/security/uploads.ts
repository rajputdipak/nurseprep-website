import { randomUUID } from "crypto";
import { escapeHtml } from "./validation";

export interface UploadUser {
  id: string;
  role: string;
  tenantId?: string;
}

export type StoredFileKind = "document" | "evidence" | "resume";

export interface StoredFile {
  tenantId: string;
  ownerId?: string;
  kind: StoredFileKind;
  visibility?: "public" | "tenant" | "private";
}

const EXECUTABLE_EXTENSION = /^(exe|php|js|sh|bat|cmd|html?)$/i;
const ALLOWED_EXTENSION = /^(pdf|png|jpe?g|docx?|xlsx?|txt|zip)$/i;

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[\u0000-\u001f<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "file";
}

export function hasDoubleExtension(name: string): boolean {
  const parts = sanitizeFilename(name).split(".");
  if (parts.length < 2) return false;
  if (EXECUTABLE_EXTENSION.test(parts[parts.length - 1])) return true;
  for (let i = 1; i < parts.length - 1; i += 1) {
    if (EXECUTABLE_EXTENSION.test(parts[i])) return true;
  }
  return false;
}

export function assertNotDoubleExtension(name: string): void {
  if (hasDoubleExtension(name)) {
    throw new Error("Double extensions are not allowed");
  }
  const ext = sanitizeFilename(name).split(".").pop() ?? "";
  if (!ALLOWED_EXTENSION.test(ext)) {
    throw new Error("File type is not allowed");
  }
}

export function storageKey(originalName: string): string {
  const extension = sanitizeFilename(originalName).split(".").pop()?.toLowerCase() ?? "bin";
  return `${randomUUID()}.${extension}`;
}

export function assertDownloadAuth(user: UploadUser | null | undefined): void {
  if (!user || !user.id) throw new Error("Authentication required");
}

function isAdmin(user: UploadUser): boolean {
  return user.role === "super_admin" || user.role === "admin" || user.role === "gov_admin";
}

export function canAccessFile(user: UploadUser | null | undefined, file: StoredFile): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (file.kind === "evidence") return false;
  if (file.kind === "resume") {
    return user.role === "recruiter" || user.role === "company_admin" || file.ownerId === user.id;
  }
  const visibility = file.visibility ?? "tenant";
  if (visibility === "public") return true;
  if (visibility === "private") return file.ownerId === user.id;
  return user.tenantId === file.tenantId;
}

export function assertFileAccess(user: UploadUser | null | undefined, file: StoredFile): void {
  if (!canAccessFile(user, file)) throw new Error("You do not have access to this file");
}

export function contentDisposition(filename: string): string {
  const safe = sanitizeFilename(filename).replace(/[\r\n"]/g, "_");
  return `attachment; filename="${safe}"`;
}

export function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {};
  Object.keys(metadata).forEach((key) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") return;
    const value = metadata[key];
    if (typeof value !== "string") return;
    output[key] = escapeHtml(value).replace(/[\u0000-\u001f]/g, "").slice(0, 200);
  });
  return output;
}
