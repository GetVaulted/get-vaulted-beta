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
