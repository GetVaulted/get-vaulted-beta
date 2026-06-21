import type { WebMarketplaceListing } from '../api/webListingsTypes';

const TTL_MS = 90_000;

let cachedRows: WebMarketplaceListing[] | null = null;
let cachedAt = 0;
let inflight: Promise<WebMarketplaceListing[]> | null = null;

export function getPublishedListingsMemorySnapshot(): WebMarketplaceListing[] | null {
  if (!cachedRows || Date.now() - cachedAt > TTL_MS) return null;
  return cachedRows;
}

export function invalidatePublishedListingsCache(): void {
  cachedRows = null;
  cachedAt = 0;
  inflight = null;
}

export async function readThroughPublishedListingsCache(
  fetchFresh: () => Promise<WebMarketplaceListing[]>,
  opts?: { force?: boolean },
): Promise<WebMarketplaceListing[]> {
  const now = Date.now();
  if (!opts?.force && cachedRows && now - cachedAt < TTL_MS) {
    return cachedRows;
  }

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const rows = await fetchFresh();
      cachedRows = rows;
      cachedAt = Date.now();
      return rows;
    } catch (e) {
      if (cachedRows) return cachedRows;
      throw e;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
