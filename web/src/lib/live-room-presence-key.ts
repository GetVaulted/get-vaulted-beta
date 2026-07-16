const memorySlots = new Map<string, string>();
const observerKeys = new Map<string, string>();

/** Stable per-browser presence slot — sync read with localStorage persistence. */
export function resolvePresenceSlotSync(userId: string | null): string {
  const base = userId ? `u:${userId}` : "guest";
  const cached = memorySlots.get(base);
  if (cached) return cached;

  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(`gv-presence:${base}`);
      if (stored) {
        memorySlots.set(base, stored);
        return stored;
      }
    } catch {
      /* private mode / blocked storage */
    }
  }

  const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  memorySlots.set(base, created);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(`gv-presence:${base}`, created);
    } catch {
      /* ignore */
    }
  }
  return created;
}

export function buildPresenceChannelKey(
  liveRoomId: string,
  userId: string | null,
  trackSelf: boolean,
): string {
  if (!trackSelf) {
    const cached = observerKeys.get(liveRoomId);
    if (cached) return cached;
    const created = `observer:${liveRoomId}:${Math.random().toString(36).slice(2, 10)}`;
    observerKeys.set(liveRoomId, created);
    return created;
  }
  return `${liveRoomId}:${resolvePresenceSlotSync(userId)}`;
}
