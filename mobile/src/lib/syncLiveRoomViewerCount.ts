import { fetchWebApiAuthed } from './fetchWebApiAuthed';

const lastSent = new Map<string, { count: number; at: number }>();
const MIN_INTERVAL_MS = 4_000;

/** Persist concurrent viewers so discovery tiles / web cards aren't stuck at 0. */
export async function syncLiveRoomViewerCount(opts: {
  liveRoomId: string;
  viewerCount: number;
  accessToken: string;
}): Promise<void> {
  const { liveRoomId, viewerCount, accessToken } = opts;
  if (!liveRoomId || !accessToken || !Number.isFinite(viewerCount)) return;

  const count = Math.max(0, Math.floor(viewerCount));
  const prev = lastSent.get(liveRoomId);
  const now = Date.now();
  if (prev) {
    if (prev.count === count && now - prev.at < MIN_INTERVAL_MS) return;
    if (now - prev.at < 1_500) return;
  }
  lastSent.set(liveRoomId, { count, at: now });

  try {
    await fetchWebApiAuthed(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/viewer-count`, accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewerCount: count }),
    });
  } catch {
    /* best-effort */
  }
}
