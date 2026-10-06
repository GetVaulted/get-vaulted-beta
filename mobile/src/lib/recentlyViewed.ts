import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'gv_recently_viewed_listings';
/** How many listing ids to remember per user. */
export const RECENTLY_VIEWED_MAX = 20;

/** Scoped per user (guests share one bucket) so a new account never inherits another's history. */
export function recentlyViewedStorageKey(userId: string | null | undefined): string {
  return `${STORAGE_KEY}:${userId?.trim() || 'guest'}`;
}

/** Move `id` to the front, drop duplicates, cap the list. Pure — easy to test. */
export function pushRecentId(ids: string[], id: string, max = RECENTLY_VIEWED_MAX): string[] {
  const trimmed = id.trim();
  if (!trimmed) return ids;
  return [trimmed, ...ids.filter((x) => x !== trimmed)].slice(0, max);
}

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  } catch {
    return [];
  }
}

export async function getRecentlyViewedIds(userId: string | null | undefined): Promise<string[]> {
  try {
    return parseIds(await AsyncStorage.getItem(recentlyViewedStorageKey(userId)));
  } catch {
    return [];
  }
}

export async function recordRecentlyViewed(
  userId: string | null | undefined,
  listingId: string,
): Promise<void> {
  try {
    const key = recentlyViewedStorageKey(userId);
    const next = pushRecentId(parseIds(await AsyncStorage.getItem(key)), listingId);
    await AsyncStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Best effort — a failed write only means the row misses one item.
  }
}
