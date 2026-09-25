import AsyncStorage from '@react-native-async-storage/async-storage';

const memorySlots = new Map<string, string>();
const warmedBases = new Set<string>();
const observerKeys = new Map<string, string>();

/**
 * Pre-load the persisted presence slot for `userId` (or the guest slot when `userId` is null)
 * into the in-memory cache, and AWAIT it — unlike `resolvePresenceSlotSync`'s best-effort
 * background reconciliation. Call this once during app bootstrap (see AuthContext), before any
 * screen that could reach a live room has mounted.
 *
 * Why this exists: `resolvePresenceSlotSync` must return synchronously (it's called from a
 * `useLayoutEffect`), so on a fresh JS engine — every force-quit/relaunch, or an iOS memory
 * eviction of a backgrounded app, both routine — its in-memory cache starts empty and it has no
 * choice but to synchronously mint a brand-new random identity, then reconcile with
 * AsyncStorage too late to matter for that call. Repeated relaunches during testing therefore
 * each present under a fresh random presence key, and old entries linger until Realtime's own
 * connection timeout — this is what produced grossly inflated viewer counts (e.g. "43 people"
 * in a near-empty room) despite the presence key being correctly frozen for the rest of that
 * session. Warming the cache here means `resolvePresenceSlotSync`'s random-mint path is only
 * ever hit if AsyncStorage is unavailable, not on a normal app launch.
 */
export async function warmPresenceSlot(userId: string | null): Promise<void> {
  const base = userId ? `u:${userId}` : 'guest';
  if (warmedBases.has(base) || memorySlots.has(base)) return;
  try {
    const stored = await AsyncStorage.getItem(`gv-presence:${base}`);
    if (stored) {
      memorySlots.set(base, stored);
    } else {
      const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      memorySlots.set(base, created);
      await AsyncStorage.setItem(`gv-presence:${base}`, created);
    }
  } catch {
    /* AsyncStorage unavailable (e.g. node tests) — resolvePresenceSlotSync's own fallback covers this. */
  } finally {
    warmedBases.add(base);
  }
}

/** Stable per-device presence slot — sync read with async persistence. */
export function resolvePresenceSlotSync(userId: string | null): string {
  const base = userId ? `u:${userId}` : 'guest';
  const cached = memorySlots.get(base);
  if (cached) return cached;
  const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  memorySlots.set(base, created);
  try {
    void AsyncStorage.getItem(`gv-presence:${base}`)
      .then((stored) => {
        if (stored) {
          memorySlots.set(base, stored);
          return;
        }
        void AsyncStorage.setItem(`gv-presence:${base}`, created);
      })
      .catch(() => {
        /* AsyncStorage unavailable (e.g. node tests) — in-memory slot is enough. */
      })
      .finally(() => {
        warmedBases.add(base);
      });
  } catch {
    /* AsyncStorage unavailable (e.g. node tests) — in-memory slot is enough. */
    warmedBases.add(base);
  }
  return created;
}

export function buildPresenceChannelKey(liveRoomId: string, userId: string | null, trackSelf: boolean): string {
  if (!trackSelf) {
    const cached = observerKeys.get(liveRoomId);
    if (cached) return cached;
    const created = `observer:${liveRoomId}:${Math.random().toString(36).slice(2, 10)}`;
    observerKeys.set(liveRoomId, created);
    return created;
  }
  return `${liveRoomId}:${resolvePresenceSlotSync(userId)}`;
}
