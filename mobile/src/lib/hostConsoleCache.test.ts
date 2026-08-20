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

  it('force refresh bypasses warm snapshot and in-flight dedupe', async () => {
    invalidateHostConsoleCache();
    let releaseSlow: (() => void) | undefined;
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const fetchFresh = vi.fn(async () => {
      await slowGate;
      return { room: { id: ROOM }, items: [] };
    });
    const slow = readThroughHostConsoleCache(TOKEN, ROOM, fetchFresh);
    const forced = readThroughHostConsoleCache(TOKEN, ROOM, fetchFresh, { force: true });
    releaseSlow?.();
    await Promise.all([slow, forced]);
    expect(fetchFresh).toHaveBeenCalledTimes(2);
  });

  it('a slower, earlier-issued poll cannot clobber a faster, later-issued force refresh', async () => {
    // Regression for: seller deletes a queue item -> force refetch (fresh, item gone) resolves
    // fast, but a background poll that was already in flight before the delete (stale, item
    // still present) resolves late and used to unconditionally overwrite the cache -- the
    // deleted item would reappear a few seconds later, looking like the delete silently failed.
    invalidateHostConsoleCache();
    let releaseStalePoll: (() => void) | undefined;
    const stalePollGate = new Promise<void>((resolve) => {
      releaseStalePoll = resolve;
    });
    const stalePayload = { room: { id: ROOM }, items: [{ id: 'item-1' }] };
    const freshPayload = { room: { id: ROOM }, items: [] };

    // Poll issued first (earlier sequence number), but resolves last.
    const stalePoll = readThroughHostConsoleCache(TOKEN, ROOM, async () => {
      await stalePollGate;
      return stalePayload;
    });

    // Force refetch issued second (later sequence number), resolves immediately.
    const forceRefresh = readThroughHostConsoleCache(
      TOKEN,
      ROOM,
      async () => freshPayload,
      { force: true },
    );
    await forceRefresh;
    expect(getHostConsoleMemorySnapshot(TOKEN, ROOM)).toEqual(freshPayload);

    // Now let the stale poll finally resolve — it must not overwrite the fresher entry.
    releaseStalePoll?.();
    await stalePoll;
    expect(getHostConsoleMemorySnapshot(TOKEN, ROOM)).toEqual(freshPayload);
  });
});
