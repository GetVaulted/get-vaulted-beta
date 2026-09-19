/** Throttle host → API writes so discovery/OBS can show concurrent viewers. */
const lastSent = new Map<string, { count: number; at: number }>();

const MIN_INTERVAL_MS = 4_000;

export async function syncLiveRoomViewerCount(opts: {
  liveRoomId: string;
  viewerCount: number;
  /** Absolute API base (mobile). Defaults to same-origin `/api/...` on web. */
  apiBase?: string;
  /** Bearer token for mobile Supabase sessions. */
  accessToken?: string | null;
}): Promise<void> {
  const { liveRoomId, viewerCount, apiBase, accessToken } = opts;
  if (!liveRoomId || !Number.isFinite(viewerCount)) return;

  const count = Math.max(0, Math.floor(viewerCount));
  const prev = lastSent.get(liveRoomId);
  const now = Date.now();
  if (prev) {
    if (prev.count === count && now - prev.at < MIN_INTERVAL_MS) return;
    if (now - prev.at < 1_500) return;
  }

  lastSent.set(liveRoomId, { count, at: now });

  const path = `/api/live-rooms/${encodeURIComponent(liveRoomId)}/viewer-count`;
  const url = apiBase ? `${apiBase.replace(/\/+$/, "")}${path}` : path;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    await fetch(url, {
      method: "POST",
      headers,
      credentials: apiBase ? "omit" : "include",
      body: JSON.stringify({ viewerCount: count }),
    });
  } catch {
    /* best-effort — in-room presence count still works without DB sync */
  }
}

export function resetLiveRoomViewerCountSyncForTests(): void {
  lastSent.clear();
}
