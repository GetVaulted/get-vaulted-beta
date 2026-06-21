import { describe, expect, it, vi } from 'vitest';
import {
  getPublishedListingsMemorySnapshot,
  invalidatePublishedListingsCache,
  readThroughPublishedListingsCache,
} from './publishedListingsCache';

describe('publishedListingsCache', () => {
  it('dedupes concurrent fetches', async () => {
    invalidatePublishedListingsCache();
    const fetchFresh = vi.fn(async () => [{ id: '1' } as never]);
    const [a, b] = await Promise.all([
      readThroughPublishedListingsCache(fetchFresh),
      readThroughPublishedListingsCache(fetchFresh),
    ]);
    expect(fetchFresh).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('serves warm snapshot within ttl', async () => {
    invalidatePublishedListingsCache();
    const fetchFresh = vi.fn(async () => [{ id: '1' } as never]);
    await readThroughPublishedListingsCache(fetchFresh);
    expect(getPublishedListingsMemorySnapshot()).toEqual([{ id: '1' }]);
    await readThroughPublishedListingsCache(fetchFresh);
    expect(fetchFresh).toHaveBeenCalledTimes(1);
  });

  it('invalidates cached rows', async () => {
    invalidatePublishedListingsCache();
    const fetchFresh = vi.fn(async () => [{ id: '1' } as never]);
    await readThroughPublishedListingsCache(fetchFresh);
    invalidatePublishedListingsCache();
    expect(getPublishedListingsMemorySnapshot()).toBeNull();
    await readThroughPublishedListingsCache(fetchFresh);
    expect(fetchFresh).toHaveBeenCalledTimes(2);
  });
});
