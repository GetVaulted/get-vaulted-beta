import { describe, expect, it, vi } from 'vitest';
import {
  getSellerLiveRoomsMemorySnapshot,
  invalidateSellerLiveRoomsCache,
  readThroughSellerLiveRoomsCache,
} from './sellerLiveRoomsCache';

const TOKEN = 'seller-token';

describe('sellerLiveRoomsCache', () => {
  it('dedupes concurrent fetches for the same token', async () => {
    invalidateSellerLiveRoomsCache();
    const fetchFresh = vi.fn(async () => [{ id: 'room-1' } as never]);
    const [a, b] = await Promise.all([
      readThroughSellerLiveRoomsCache(TOKEN, fetchFresh),
      readThroughSellerLiveRoomsCache(TOKEN, fetchFresh),
    ]);
    expect(fetchFresh).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('serves warm snapshot within ttl', async () => {
    invalidateSellerLiveRoomsCache();
    const fetchFresh = vi.fn(async () => [{ id: 'room-1' } as never]);
    await readThroughSellerLiveRoomsCache(TOKEN, fetchFresh);
    expect(getSellerLiveRoomsMemorySnapshot(TOKEN)).toEqual([{ id: 'room-1' }]);
    await readThroughSellerLiveRoomsCache(TOKEN, fetchFresh);
    expect(fetchFresh).toHaveBeenCalledTimes(1);
  });

  it('invalidates cached rows', async () => {
    invalidateSellerLiveRoomsCache();
    const fetchFresh = vi.fn(async () => [{ id: 'room-1' } as never]);
    await readThroughSellerLiveRoomsCache(TOKEN, fetchFresh);
    invalidateSellerLiveRoomsCache();
    expect(getSellerLiveRoomsMemorySnapshot(TOKEN)).toBeNull();
    await readThroughSellerLiveRoomsCache(TOKEN, fetchFresh);
    expect(fetchFresh).toHaveBeenCalledTimes(2);
  });

  it('force bypasses warm snapshot', async () => {
    invalidateSellerLiveRoomsCache();
    const fetchFresh = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'room-1' } as never])
      .mockResolvedValueOnce([{ id: 'room-2' } as never]);
    await readThroughSellerLiveRoomsCache(TOKEN, fetchFresh);
    const rows = await readThroughSellerLiveRoomsCache(TOKEN, fetchFresh, { force: true });
    expect(fetchFresh).toHaveBeenCalledTimes(2);
    expect(rows).toEqual([{ id: 'room-2' }]);
  });
});
