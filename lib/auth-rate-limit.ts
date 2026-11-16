interface AttemptWindow {
  count: number;
  first: number;
}

const MAX_ENTRIES = 5_000;
const attempts = new Map<string, AttemptWindow>();
const cooldowns = new Map<string, number>();

function prune(now: number) {
  if (attempts.size <= MAX_ENTRIES && cooldowns.size <= MAX_ENTRIES) return;
  attempts.forEach((entry, key) => {
    if (now - entry.first > 60 * 60_000) attempts.delete(key);
  });
  cooldowns.forEach((until, key) => {
    if (until <= now) cooldowns.delete(key);
  });
}

export function consumeAttempt(
  key: string,
  limit = 5,
  windowMs = 15 * 60_000
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first >= windowMs) {
    attempts.set(key, { count: 1, first: now });
    prune(now);
    return { allowed: true, retryAfterMs: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfterMs: windowMs - (now - entry.first) };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}

export function inCooldown(key: string): boolean {
  return (cooldowns.get(key) ?? 0) > Date.now();
}

export function startCooldown(key: string, ms = 60_000) {
  cooldowns.set(key, Date.now() + ms);
  prune(Date.now());
}

export function endCooldown(key: string) {
  cooldowns.delete(key);
}

// Per-instance memory: limits reset on redeploy and are not shared across serverless
// instances. Supabase Auth rate limits remain the authoritative backstop.
export function resetAuthLimits() {
  attempts.clear();
  cooldowns.clear();
}
