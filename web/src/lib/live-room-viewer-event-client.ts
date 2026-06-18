const JOIN_COOLDOWN_MS = 30_000;

function joinCooldownKey(roomId: string): string {
  return `gv-live-join-${roomId}`;
}

/** Persisted join announcement with 30s client cooldown (matches server dedupe). */
export async function announceLiveRoomJoin(roomId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const key = joinCooldownKey(roomId);
  const last = Number(sessionStorage.getItem(key) ?? 0);
  if (Date.now() - last < JOIN_COOLDOWN_MS) return;

  const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/viewer-event`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "join" }),
  });
  if (res.ok) {
    sessionStorage.setItem(key, String(Date.now()));
  }
}
