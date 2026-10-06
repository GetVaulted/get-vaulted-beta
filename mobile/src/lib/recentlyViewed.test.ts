import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => (memory.has(key) ? memory.get(key)! : null)),
    setItem: vi.fn(async (key: string, value: string) => {
      memory.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      memory.delete(key);
    }),
  },
}));

import {
  RECENTLY_VIEWED_MAX,
  getRecentlyViewedIds,
  pushRecentId,
  recentlyViewedStorageKey,
  recordRecentlyViewed,
} from './recentlyViewed';

describe('pushRecentId', () => {
  it('puts the newest id first and removes the older duplicate', () => {
    expect(pushRecentId(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it('caps the list length', () => {
    const many = Array.from({ length: RECENTLY_VIEWED_MAX }, (_, i) => `id${i}`);
    const next = pushRecentId(many, 'fresh');
    expect(next).toHaveLength(RECENTLY_VIEWED_MAX);
    expect(next[0]).toBe('fresh');
    expect(next).not.toContain(`id${RECENTLY_VIEWED_MAX - 1}`);
  });

  it('ignores blank ids', () => {
    expect(pushRecentId(['a'], '   ')).toEqual(['a']);
  });
});

describe('recordRecentlyViewed / getRecentlyViewedIds', () => {
  beforeEach(() => memory.clear());

  it('returns an empty list when nothing is stored', async () => {
    expect(await getRecentlyViewedIds('u1')).toEqual([]);
  });

  it('records most recent first', async () => {
    await recordRecentlyViewed('u1', 'a');
    await recordRecentlyViewed('u1', 'b');
    await recordRecentlyViewed('u1', 'a');
    expect(await getRecentlyViewedIds('u1')).toEqual(['a', 'b']);
  });

  it('keeps each user (and guests) separate', async () => {
    await recordRecentlyViewed('u1', 'a');
    await recordRecentlyViewed(null, 'g');
    expect(await getRecentlyViewedIds('u2')).toEqual([]);
    expect(await getRecentlyViewedIds(undefined)).toEqual(['g']);
    expect(recentlyViewedStorageKey('u1')).not.toBe(recentlyViewedStorageKey('u2'));
  });

  it('survives corrupt stored data', async () => {
    memory.set(recentlyViewedStorageKey('u1'), '{not json');
    expect(await getRecentlyViewedIds('u1')).toEqual([]);
    await recordRecentlyViewed('u1', 'a');
    expect(await getRecentlyViewedIds('u1')).toEqual(['a']);
  });
});
