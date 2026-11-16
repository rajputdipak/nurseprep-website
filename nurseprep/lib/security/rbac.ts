export type Role =
  | "super_admin"
  | "gov_admin"
  | "company_admin"
  | "employee"
  | "contractor"
  | "user"
  | "public";

export interface Actor {
  id: string;
  role: Role;
  tenantId?: string;
  tenantType?: "gov" | "company";
  projects?: string[];
}

export interface TenantResource {
  id: string;
  type: "gov" | "company";
}

export class PermissionError extends Error {}

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  super_admin: ["*"],
  gov_admin: [
    "gov:read",
    "gov:write",
    "tender:read",
    "tender:create",
    "tender:award",
    "project:read",
    "document:read",
    "complaint:read",
    "audit:read",
  ],
  company_admin: [
    "company:read",
    "company:write",
    "tender:read",
    "bid:submit",
    "job:create",
    "job:read",
    "project:read",
    "document:read",
    "complaint:file",
    "audit:read",
  ],
  employee: ["company:read", "job:read", "project:read"],
  contractor: ["bid:submit:own", "job:read", "project:read"],
  user: ["self:read"],
  public: ["jobs:read", "tenders:read"],
};

export function can(role: Role, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertCan(actor: Actor, permission: string): void {
  if (!can(actor.role, permission)) {
    throw new PermissionError(`Missing permission: ${permission}`);
  }
}

export function canAccessTenant(actor: Actor, tenant: TenantResource): boolean {
  if (actor.role === "super_admin") return true;
  return actor.tenantId === tenant.id && actor.tenantType === tenant.type;
}

export function isSameTenant(actor: Actor, tenantId: string): boolean {
  return actor.tenantId === tenantId;
}

export function canAccessUserProfile(actor: Actor, targetUserId: string): boolean {
  return actor.id === targetUserId || actor.role === "super_admin";
}

export function canAccessProject(
  actor: Actor,
  project: { id: string; members: string[] }
): boolean {
  if (actor.role === "super_admin") return true;
  return project.members.includes(actor.id);
}

export function canAccessDocument(
  actor: Actor,
  doc: {
    tenantId: string;
    ownerId?: string;
    visibility: "public" | "tenant" | "private";
  }
): boolean {
  if (actor.role === "super_admin") return true;
  if (doc.visibility === "public") return true;
  if (doc.visibility === "private") return doc.ownerId === actor.id;
  return actor.tenantId === doc.tenantId;
}

export function canDownloadFile(
  actor: Actor,
  file: { tenantId: string; ownerId?: string; visibility: "public" | "tenant" | "private" }
): boolean {
  return canAccessDocument(actor, file);
}

export function canAccessOwnerOnly(actor: Actor, ownerId: string): boolean {
  return actor.id === ownerId || actor.role === "super_admin";
}

export function canDeactivateSelf(actor: Actor, targetUserId: string): boolean {
  return actor.id !== targetUserId;
}

export function canDeleteSelf(actor: Actor, targetUserId: string): boolean {
  return actor.id !== targetUserId;
}

export function canChangeOwnRole(actor: Actor, targetUserId: string): boolean {
  return actor.id !== targetUserId;
}

export function canGrantRole(actor: Actor, role: Role): boolean {
  if (actor.role === "super_admin") return true;
  if (actor.role === "gov_admin") return role === "employee";
  if (actor.role === "company_admin") return role === "employee" || role === "contractor";
  return false;
}

export function auditTenantScope(actor: Actor): string | null {
  return actor.role === "super_admin" ? null : actor.tenantId ?? null;
}

export function canReadPublicResource(role: Role, kind: "jobs" | "tenders"): boolean {
  return can(role, kind === "jobs" ? "jobs:read" : "tenders:read");
}
