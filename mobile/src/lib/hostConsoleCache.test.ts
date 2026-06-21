import { describe, expect, it, vi } from 'vitest';
import {
  getHostConsoleMemorySnapshot,
  invalidateHostConsoleCache,
  readThroughHostConsoleCache,
} from './hostConsoleCache';

const TOKEN = 'host-token';
const ROOM = 'room-1';

describe('hostConsoleCache', () => {
  it('dedupes concurrent fetches for the same room', async () => {
    invalidateHostConsoleCache();
    const fetchFresh = vi.fn(async () => ({ room: { id: ROOM } }));
    const [a, b] = await Promise.all([
      readThroughHostConsoleCache(TOKEN, ROOM, fetchFresh),
      readThroughHostConsoleCache(TOKEN, ROOM, fetchFresh),
    ]);
    expect(fetchFresh).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('serves warm snapshot within ttl', async () => {
    invalidateHostConsoleCache();
    const fetchFresh = vi.fn(async () => ({ room: { id: ROOM } }));
    await readThroughHostConsoleCache(TOKEN, ROOM, fetchFresh);
    expect(getHostConsoleMemorySnapshot(TOKEN, ROOM)).toEqual({ room: { id: ROOM } });
    await readThroughHostConsoleCache(TOKEN, ROOM, fetchFresh);
    expect(fetchFresh).toHaveBeenCalledTimes(1);
  });
});
