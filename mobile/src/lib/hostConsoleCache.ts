const TTL_MS = 12_000;

type CacheEntry<T> = {
  key: string;
  payload: T;
  savedAt: number;
};

let cached: CacheEntry<unknown> | null = null;
let inflight: Promise<unknown> | null = null;
let inflightKey: string | null = null;

function cacheKey(accessToken: string, roomId: string): string {
  return `${accessToken.trim()}:${roomId.trim()}`;
}

export function getHostConsoleMemorySnapshot<T>(
  accessToken: string,
  roomId: string,
): T | null {
  const key = cacheKey(accessToken, roomId);
  if (!cached || cached.key !== key) return null;
  if (Date.now() - cached.savedAt > TTL_MS) return null;
  return cached.payload as T;
}

export function invalidateHostConsoleCache(roomId?: string): void {
  if (roomId && cached && !cached.key.endsWith(`:${roomId.trim()}`)) return;
  cached = null;
  inflight = null;
  inflightKey = null;
}

export async function readThroughHostConsoleCache<T>(
  accessToken: string,
  roomId: string,
  fetchFresh: () => Promise<T>,
  opts?: { force?: boolean },
): Promise<T> {
  const key = cacheKey(accessToken, roomId);
  if (!accessToken.trim() || !roomId.trim()) return fetchFresh();

  const warm = getHostConsoleMemorySnapshot<T>(accessToken, roomId);
  if (!opts?.force && warm) return warm;

  if (inflight && inflightKey === key) return inflight as Promise<T>;

  inflightKey = key;
  inflight = (async () => {
    try {
      const payload = await fetchFresh();
      cached = { key, payload, savedAt: Date.now() };
      return payload;
    } catch (e) {
      if (cached?.key === key) return cached.payload;
      throw e;
    } finally {
      inflight = null;
      inflightKey = null;
    }
  })();

  return inflight as Promise<T>;
}
