/**
 * Tiny per-server-instance TTL cache with single-flight loading.
 *
 * Built for read endpoints that every viewer in a live room hits on a timer: while one request is
 * loading a value, every other request for the same key awaits that same promise instead of
 * issuing its own database queries, and for `ttlMs` afterwards they all reuse the result. With a
 * 1.5 s TTL, a thousand viewers on one server instance cost one load per 1.5 s instead of a
 * thousand. Failed loads are never cached.
 */
type Entry<T> = { value: T; expiresAtMs: number };

export type TtlCache<T> = {
  get(key: string, ttlMs: number, load: () => Promise<T>): Promise<T>;
  clear(): void;
  size(): number;
};

export function createTtlCache<T>(maxEntries = 2_000, now: () => number = Date.now): TtlCache<T> {
  const entries = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T>>();

  function evictIfFull() {
    if (entries.size < maxEntries) return;
    const t = now();
    for (const [k, e] of entries) if (e.expiresAtMs <= t) entries.delete(k);
    if (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
  }

  return {
    async get(key, ttlMs, load) {
      const hit = entries.get(key);
      if (hit && hit.expiresAtMs > now()) return hit.value;

      const pending = inflight.get(key);
      if (pending) return pending;

      const p = load()
        .then((value) => {
          evictIfFull();
          entries.set(key, { value, expiresAtMs: now() + ttlMs });
          return value;
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, p);
      return p;
    },
    clear() {
      entries.clear();
      inflight.clear();
    },
    size: () => entries.size,
  };
}
