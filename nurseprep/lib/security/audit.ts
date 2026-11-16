import { randomUUID } from "crypto";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditInput {
  type: string;
  actorId?: string;
  tenantId?: string;
  requestId?: string;
  severity?: AuditSeverity;
  details?: Record<string, unknown>;
}

export interface AuditEntry {
  id: string;
  at: number;
  type: string;
  actorId?: string;
  tenantId?: string;
  requestId?: string;
  severity: AuditSeverity;
  details?: Record<string, unknown>;
}

let entries: AuditEntry[] = [];
let alertHandlers: Array<(entry: AuditEntry) => void> = [];

export function resetAudit(): void {
  entries = [];
  alertHandlers = [];
}

export function registerAlertHandler(handler: (entry: AuditEntry) => void): void {
  alertHandlers.push(handler);
}

export function logAudit(input: AuditInput): Readonly<AuditEntry> {
  const entry: AuditEntry = Object.freeze({
    id: randomUUID(),
    at: Date.now(),
    type: input.type,
    actorId: input.actorId,
    tenantId: input.tenantId,
    requestId: input.requestId,
    severity: input.severity ?? "info",
    details: input.details ? Object.freeze({ ...input.details }) : undefined,
  });
  entries.push(entry);
  if (entry.severity === "critical") {
    alertHandlers.forEach((handler) => {
      try {
        handler(entry);
      } catch {
        // an alerting failure must never break the audited action
      }
    });
  }
  return entry;
}

export function getAuditEntries(): readonly AuditEntry[] {
  return entries.slice();
}

export function siemEvent(entry: AuditEntry): Record<string, unknown> {
  return {
    event_type: entry.type,
    severity: entry.severity,
    actor_id: entry.actorId ?? null,
    tenant_id: entry.tenantId ?? null,
    request_id: entry.requestId ?? null,
    timestamp: new Date(entry.at).toISOString(),
  };
}

export function requestIdHeader(requestId: string): Record<string, string> {
  return { "x-request-id": requestId };
}

export function newRequestId(): string {
  return randomUUID();
}

export function sanitizeError(production: boolean): { error: string; code: string } {
  return production
    ? { error: "Something went wrong. Please try again.", code: "internal_error" }
    : { error: "Internal error", code: "internal_error" };
}

export function validationError(field: string, message: string): { error: string } {
  return { error: `${field}: ${message}` };
}
