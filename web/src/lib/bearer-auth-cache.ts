import { createHash } from "node:crypto";

/**
 * Short-lived, per-server-instance cache of verified mobile Bearer sessions.
 *
 * Every authenticated app request used to cost one Supabase Auth round trip plus three or four
 * database queries (user resolve, deleted/suspended check, Stripe sibling sync) before any real work
 * ran. At live-show scale (tens of thousands of requests per second) that identity check was the
 * single largest source of load. A verified token is now reused for a few seconds, so repeat
 * requests from the same session skip all of it.
 *
 * Trade-off: a suspension, deletion or token revocation takes effect within {@link BEARER_AUTH_CACHE_TTL_MS}
 * instead of instantly. Only successful verifications are cached — failures always re-check.
 */
export const BEARER_AUTH_CACHE_TTL_MS = 30_000;
const BEARER_AUTH_CACHE_MAX_ENTRIES = 5_000;

export type CachedBearerAuth = { userId: string; supabaseAuthUserId: string };

type Entry = { value: CachedBearerAuth; expiresAtMs: number };

const cache = new Map<string, Entry>();

/** Never keep the raw token in memory as a key. */
function keyFor(jwt: string): string {
  return createHash("sha256").update(jwt).digest("hex");
}

/** `exp` (seconds) from an already-verified JWT, or null if unreadable. */
function jwtExpiryMs(jwt: string): number | null {
  try {
    const part = jwt.split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function getCachedBearerAuth(jwt: string, nowMs: number = Date.now()): CachedBearerAuth | null {
  const key = keyFor(jwt);
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAtMs <= nowMs) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCachedBearerAuth(
  jwt: string,
  value: CachedBearerAuth,
  nowMs: number = Date.now(),
): void {
  const jwtExp = jwtExpiryMs(jwt);
  const expiresAtMs = Math.min(nowMs + BEARER_AUTH_CACHE_TTL_MS, jwtExp ?? Number.POSITIVE_INFINITY);
  if (expiresAtMs <= nowMs) return;
  if (cache.size >= BEARER_AUTH_CACHE_MAX_ENTRIES) {
    // Drop expired entries first; if still full, drop the oldest insertion.
    for (const [k, e] of cache) if (e.expiresAtMs <= nowMs) cache.delete(k);
    if (cache.size >= BEARER_AUTH_CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }
  cache.set(keyFor(jwt), { value, expiresAtMs });
}

export function clearBearerAuthCache(): void {
  cache.clear();
}
