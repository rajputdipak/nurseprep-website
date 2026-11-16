export const TRIAL_DAYS = 7;

const DAY_MS = 86_400_000;

export interface TrialState {
  endsAt: number;
  remainingMs: number;
  daysLeft: number;
  active: boolean;
}

export function getTrialState(createdAt: string, now: number = Date.now()): TrialState | null {
  const joinedAt = Date.parse(createdAt);
  if (!Number.isFinite(joinedAt)) return null;
  const endsAt = joinedAt + TRIAL_DAYS * DAY_MS;
  const remainingMs = Math.max(0, endsAt - now);
  return {
    endsAt,
    remainingMs,
    daysLeft: remainingMs > 0 ? Math.min(TRIAL_DAYS, Math.ceil(remainingMs / DAY_MS)) : 0,
    active: remainingMs > 0,
  };
}

export function formatTrialRemaining(remainingMs: number): string {
  const totalMinutes = Math.ceil(Math.max(0, remainingMs) / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
