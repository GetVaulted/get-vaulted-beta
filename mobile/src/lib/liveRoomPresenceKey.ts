import AsyncStorage from '@react-native-async-storage/async-storage';

const memorySlots = new Map<string, string>();
const observerKeys = new Map<string, string>();

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
      });
  } catch {
    /* AsyncStorage unavailable (e.g. node tests) — in-memory slot is enough. */
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
