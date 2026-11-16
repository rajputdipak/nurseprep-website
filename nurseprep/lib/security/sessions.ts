import { randomUUID } from "crypto";

export class SessionError extends Error {}

export interface Session {
  id: string;
  userId: string;
  deviceId: string;
  role: string;
  createdAt: number;
  lastSeenAt: number;
  absoluteExpiresAt: number;
  revoked: boolean;
}

interface RefreshRecord {
  sessionId: string;
  used: boolean;
}

const sessions = new Map<string, Session>();
const refreshTokens = new Map<string, RefreshRecord>();

const INACTIVITY_MS = 30 * 60_000;
const ABSOLUTE_MS = 12 * 3_600_000;

export function resetSessions(): void {
  sessions.clear();
  refreshTokens.clear();
}

export function createSession(input: {
  userId: string;
  deviceId: string;
  role: string;
  now?: number;
  absoluteMs?: number;
}): { sessionId: string; refreshToken: string; accessToken: string } {
  const now = input.now ?? Date.now();
  const id = randomUUID();
  sessions.set(id, {
    id,
    userId: input.userId,
    deviceId: input.deviceId,
    role: input.role,
    createdAt: now,
    lastSeenAt: now,
    absoluteExpiresAt: now + (input.absoluteMs ?? ABSOLUTE_MS),
    revoked: false,
  });
  const refreshToken = randomUUID();
  refreshTokens.set(refreshToken, { sessionId: id, used: false });
  return { sessionId: id, refreshToken, accessToken: `access.${id}` };
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function validateSession(
  sessionId: string,
  options: { now?: number; deviceId?: string; inactivityMs?: number } = {}
): { valid: boolean; reason?: string } {
  const session = sessions.get(sessionId);
  if (!session) return { valid: false, reason: "missing" };
  if (session.revoked) return { valid: false, reason: "revoked" };
  const now = options.now ?? Date.now();
  if (options.deviceId && session.deviceId !== options.deviceId) {
    return { valid: false, reason: "device_mismatch" };
  }
  if (now >= session.absoluteExpiresAt) return { valid: false, reason: "absolute_expired" };
  if (now - session.lastSeenAt > (options.inactivityMs ?? INACTIVITY_MS)) {
    return { valid: false, reason: "inactivity_expired" };
  }
  session.lastSeenAt = now;
  return { valid: true };
}

export function rotateRefresh(
  refreshToken: string,
  now = Date.now()
): { refreshToken: string; accessToken: string } {
  const record = refreshTokens.get(refreshToken);
  if (!record) throw new SessionError("Invalid refresh token");
  if (record.used) {
    revokeUserSessions(sessions.get(record.sessionId)?.userId ?? "");
    throw new SessionError("Refresh token replay detected");
  }
  const session = sessions.get(record.sessionId);
  if (!session || session.revoked) throw new SessionError("Session revoked");
  if (now >= session.absoluteExpiresAt) throw new SessionError("Session expired");

  record.used = true;
  const next = randomUUID();
  refreshTokens.set(next, { sessionId: session.id, used: false });
  session.lastSeenAt = now;
  return { refreshToken: next, accessToken: `access.${session.id}` };
}

export function revokeSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.revoked = true;
  refreshTokens.forEach((record) => {
    if (record.sessionId === sessionId) record.used = true;
  });
}

export function revokeUserSessions(userId: string): void {
  sessions.forEach((session) => {
    if (session.userId === userId) revokeSession(session.id);
  });
}

export function logout(sessionId: string): void {
  revokeSession(sessionId);
}

export function onPasswordChange(userId: string): void {
  revokeUserSessions(userId);
}

export function onRoleChange(userId: string): void {
  revokeUserSessions(userId);
}

export function onAccountDisable(userId: string): void {
  revokeUserSessions(userId);
}

export function activeSessions(userId: string): Session[] {
  const active: Session[] = [];
  sessions.forEach((session) => {
    if (session.userId === userId && !session.revoked) active.push(session);
  });
  return active;
}

export function enforceConcurrentSessionLimit(userId: string, max = 3): string[] {
  const active = activeSessions(userId).sort((a, b) => a.createdAt - b.createdAt);
  const revoked: string[] = [];
  while (active.length > max) {
    const oldest = active.shift();
    if (oldest) {
      revokeSession(oldest.id);
      revoked.push(oldest.id);
    }
  }
  return revoked;
}

export function sessionCookieOptions(production: boolean): {
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
    maxAge: 60 * 60 * 12,
  };
}
