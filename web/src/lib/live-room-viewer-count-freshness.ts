/**
 * Discovery / OBS / OG read `LiveRoom.viewerCount` from the DB — a cache of live presence.
 * Without a freshness gate that cache goes stale (host leaves overnight → feed still shows 3).
 * In-room UI uses Supabase presence; these must agree once the cache is fresh or expired.
 */

/** Host/buyer sync runs every few seconds; allow brief reconnect gaps before treating as empty. */
export const LIVE_VIEWER_COUNT_MAX_AGE_MS = 90_000;

export function effectiveLiveRoomViewerCount(args: {
  viewerCount: number;
  viewerCountUpdatedAt: Date | string | null | undefined;
  nowMs?: number;
  maxAgeMs?: number;
}): number {
  const raw = Number.isFinite(args.viewerCount) ? Math.max(0, Math.floor(args.viewerCount)) : 0;
  if (raw === 0) return 0;

  const updatedAt = args.viewerCountUpdatedAt;
  if (updatedAt == null) {
    // Pre-migration / never-synced inflated rows must not show on discovery.
    return 0;
  }

  const updatedMs =
    updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedMs)) return 0;

  const now = args.nowMs ?? Date.now();
  const maxAge = args.maxAgeMs ?? LIVE_VIEWER_COUNT_MAX_AGE_MS;
  if (now - updatedMs > maxAge) return 0;
  return raw;
}
