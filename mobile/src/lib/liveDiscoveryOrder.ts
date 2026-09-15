import type { LiveStream } from '../types';

export type LivePromoBadge = 'FEATURED' | 'TRENDING' | 'PROMOTED';

/** Epoch ms for a scheduled start; unknown/invalid times sort to the very end. */
function scheduledStartMs(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Upcoming shows ordered by scheduled start — soonest first (today on top, then later shows in
 * chronological order down the list). Shows with no/invalid start time fall to the bottom. Stable
 * (equal times keep their incoming order).
 */
export function orderScheduledStreamsByStartTime<T extends { scheduledStartAtIso?: string | null }>(
  streams: T[],
): T[] {
  return streams
    .map((stream, index) => ({ stream, index }))
    .sort((a, b) => {
      const delta = scheduledStartMs(a.stream.scheduledStartAtIso) - scheduledStartMs(b.stream.scheduledStartAtIso);
      return delta !== 0 ? delta : a.index - b.index;
    })
    .map((entry) => entry.stream);
}

export type OrderedLiveRoom = {
  stream: LiveStream;
  promoBadge?: LivePromoBadge;
};

/** Promoted rooms surface first; badge only — never larger tiles. */
export function orderLiveDiscoveryRooms(rooms: LiveStream[]): OrderedLiveRoom[] {
  const sorted = [...rooms].sort((a, b) => {
    const heroA = a.isHero ? 1 : 0;
    const heroB = b.isHero ? 1 : 0;
    if (heroB !== heroA) return heroB - heroA;
    return (b.viewers ?? 0) - (a.viewers ?? 0);
  });

  return sorted.map((stream, index) => {
    let promoBadge: LivePromoBadge | undefined;
    if (stream.isHero || index === 0) promoBadge = 'FEATURED';
    else if (index < 4) promoBadge = 'TRENDING';
    else if (index < 8 && (stream.viewers ?? 0) >= 12) promoBadge = 'PROMOTED';
    return { stream, promoBadge };
  });
}

/**
 * Locks card positions in place across background refreshes so the grid doesn't reshuffle out
 * from under a scrolling/tapping finger. `orderLiveDiscoveryRooms` sorts primarily by live viewer
 * count, which changes constantly — re-sorting on every 45s poll / realtime viewer-count tick (see
 * `useLiveDiscoverySync`) made cards physically swap positions mid-scroll, and made a tap that
 * started on one card sometimes land on a different show once the reorder landed mid-gesture.
 *
 * `freshlyOrdered` is the latest viewer-sorted result (fresh data for every room). `previousOrderIds`
 * is the id sequence last shown, or `null`/empty to start fresh (first load, chip switch, explicit
 * pull-to-refresh). Rooms already in `previousOrderIds` keep their relative position with updated
 * data; rooms no longer present drop out; brand-new rooms append at the end in their already-sorted
 * order, so nothing already on screen ever jumps — the list can only grow at the bottom or shrink
 * where a show genuinely ended.
 */
export function stabilizeLiveDiscoveryOrder(
  freshlyOrdered: OrderedLiveRoom[],
  previousOrderIds: string[] | null | undefined,
): { result: OrderedLiveRoom[]; nextOrderIds: string[] } {
  if (!previousOrderIds || previousOrderIds.length === 0) {
    return { result: freshlyOrdered, nextOrderIds: freshlyOrdered.map((r) => r.stream.id) };
  }

  const byId = new Map(freshlyOrdered.map((r) => [r.stream.id, r]));
  const kept: OrderedLiveRoom[] = [];
  const keptIds = new Set<string>();
  for (const id of previousOrderIds) {
    const room = byId.get(id);
    if (!room || keptIds.has(id)) continue;
    kept.push(room);
    keptIds.add(id);
  }
  const newcomers = freshlyOrdered.filter((r) => !keptIds.has(r.stream.id));
  const result = [...kept, ...newcomers];
  return { result, nextOrderIds: result.map((r) => r.stream.id) };
}
