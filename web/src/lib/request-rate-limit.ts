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

/**
 * Best-effort caller identity for rate-limiting traffic that may be anonymous (guest buyers on
 * live-room polling endpoints never authenticate). Not spoof-proof — a malicious client can
 * forge `x-forwarded-for` — but this only needs to be good enough to catch a runaway poll loop,
 * not to serve as an auth boundary. Multiple legitimate viewers behind the same NAT/proxy share
 * a key; the limits applied against this key are set generously for exactly that reason.
 */
export function clientIpKey(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-nf-client-connection-ip")?.trim() ||
    "unknown"
  );
}
