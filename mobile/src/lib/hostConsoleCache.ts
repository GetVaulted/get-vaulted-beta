const TTL_MS = 12_000;

type CacheEntry<T> = {
  key: string;
  payload: T;
  savedAt: number;
  /** Issue-order sequence of the fetch that produced this entry — see `readThroughHostConsoleCache`. */
  seq: number;
};

let cached: CacheEntry<unknown> | null = null;
let inflight: Promise<unknown> | null = null;
let inflightKey: string | null = null;
// Monotonic counter assigned at fetch-ISSUE time (not resolve time). The seller's live console
// polls this same host-console endpoint every 3-25s while a show is live/scheduled, and a queue
// mutation (delete/pin/reorder/...) forces its own immediate refetch on top of that. Two requests
// can be in flight together, and network timing does not guarantee the one issued later resolves
// last: an older poll that was already in flight when a force-refetch fires can resolve AFTER it,
// and used to unconditionally overwrite `cached` with its pre-mutation snapshot — the deleted item
// would reappear a few seconds later on the next poll, looking exactly like "I deleted it and
// nothing happened." Comparing sequence numbers at write time ensures a response from an
// earlier-issued request can never clobber a cache entry already written by a later-issued one,
// regardless of which resolves first.
let issueSeq = 0;

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

  if (opts?.force) {
    if (cached?.key === key) cached = null;
  } else {
    const warm = getHostConsoleMemorySnapshot<T>(accessToken, roomId);
    if (warm) return warm;
    if (inflight && inflightKey === key) return inflight as Promise<T>;
  }

  const mySeq = ++issueSeq;
  inflightKey = key;
  inflight = (async () => {
    try {
      const payload = await fetchFresh();
      // Only commit if no later-issued request has already written a fresher entry.
      if (mySeq >= (cached?.seq ?? 0)) {
        cached = { key, payload, savedAt: Date.now(), seq: mySeq };
      }
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
