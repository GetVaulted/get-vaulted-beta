import type { LiveStream } from '../types';

export type LivePromoBadge = 'FEATURED' | 'TRENDING' | 'PROMOTED';

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
