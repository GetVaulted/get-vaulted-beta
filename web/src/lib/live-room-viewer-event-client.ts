/** Persisted join announcement with 30s client cooldown (matches server dedupe). */
export async function announceLiveRoomJoin(roomId: string): Promise<void> {
  if (typeof window === "undefined") return;

  const inFlight = joinInFlightByRoom.get(roomId);
  if (inFlight) {
    await inFlight;
    return;
  }

  const task = (async () => {
    const key = joinCooldownKey(roomId);
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < JOIN_COOLDOWN_MS) return;

    sessionStorage.setItem(key, String(Date.now()));

    const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/viewer-event`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "join" }),
    });
    if (!res.ok) {
      sessionStorage.removeItem(key);
    }
  })();

  joinInFlightByRoom.set(roomId, task);
  try {
    await task;
  } finally {
    if (joinInFlightByRoom.get(roomId) === task) {
      joinInFlightByRoom.delete(roomId);
    }
  }
}

/** Pause open-entry giveaway rows when the viewer leaves the live room. */
export function announceLiveRoomLeave(roomId: string): void {
  if (typeof window === "undefined") return;
  const url = `/api/live-rooms/${encodeURIComponent(roomId)}/viewer-event`;
  const body = JSON.stringify({ kind: "leave" });
  void fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* best-effort on tab close / navigation */
  });
}
