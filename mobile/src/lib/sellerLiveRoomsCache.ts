import type { LiveRoomApiRow } from '../api/liveRoomsRepository';

const TTL_MS = 45_000;

type CacheEntry = {
  token: string;
  rows: LiveRoomApiRow[];
  savedAt: number;
};

let cached: CacheEntry | null = null;
let inflight: Promise<LiveRoomApiRow[]> | null = null;
let inflightToken: string | null = null;

export function getSellerLiveRoomsMemorySnapshot(accessToken: string): LiveRoomApiRow[] | null {
  if (!cached || cached.token !== accessToken.trim()) return null;
  if (Date.now() - cached.savedAt > TTL_MS) return null;
  return cached.rows;
}

export function invalidateSellerLiveRoomsCache(): void {
  cached = null;
  inflight = null;
  inflightToken = null;
}

export async function readThroughSellerLiveRoomsCache(
  accessToken: string,
  fetchFresh: () => Promise<LiveRoomApiRow[]>,
  opts?: { force?: boolean },
): Promise<LiveRoomApiRow[]> {
  const token = accessToken.trim();
  if (!token) return [];

  const warm = getSellerLiveRoomsMemorySnapshot(token);
  if (!opts?.force && warm) {
    // Revalidate empty snapshots quickly — a transient API/DB blip should not stick for 45s.
    const emptyWarm = warm.length === 0;
    const ageMs = cached ? Date.now() - cached.savedAt : TTL_MS + 1;
    if (!emptyWarm || ageMs < 8_000) return warm;
  }

  if (inflight && inflightToken === token) return inflight;

  inflightToken = token;
  inflight = (async () => {
    try {
      const rows = await fetchFresh();
      cached = { token, rows, savedAt: Date.now() };
      return rows;
    } catch (e) {
      if (cached?.token === token) return cached.rows;
      throw e;
    } finally {
      inflight = null;
      inflightToken = null;
    }
  })();

  return inflight;
}
