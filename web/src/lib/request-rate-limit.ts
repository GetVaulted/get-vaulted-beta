type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number; now?: number },
): { ok: true; remaining: number; resetAt: number } | { ok: false; retryAfterMs: number } {
  const now = opts.now ?? Date.now();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + opts.windowMs;
    store.set(key, { count: 1, resetAt });
    return { ok: true, remaining: Math.max(0, opts.limit - 1), resetAt };
  }

  if (current.count >= opts.limit) {
    return { ok: false, retryAfterMs: Math.max(1, current.resetAt - now) };
  }

  current.count += 1;
  store.set(key, current);
  return { ok: true, remaining: Math.max(0, opts.limit - current.count), resetAt: current.resetAt };
}

export function __resetRateLimitsForTests() {
  store.clear();
}
