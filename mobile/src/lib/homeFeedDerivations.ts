import type { FeaturedCreator, LiveStream, Product, SaleActivity, ScheduledStream } from '../types';

export function deriveVerifiedSellers(
  liveRows: LiveStream[],
  scheduledRows: ScheduledStream[],
): FeaturedCreator[] {
  const seen = new Set<string>();
  const out: FeaturedCreator[] = [];

  for (const stream of liveRows) {
    const id = stream.host.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      host: stream.host,
      specialty: stream.categoryTags.slice(0, 2).join(' · ') || 'Live breaks & auctions',
      status: 'live',
      statusLabel: 'Live now',
    });
  }

  for (const event of scheduledRows) {
    const id = event.host.id?.trim();
    if (!id || seen.has(id) || out.length >= 10) continue;
    seen.add(id);
    out.push({
      host: event.host,
      specialty: event.eventTag || 'Upcoming vault event',
      status: 'scheduled',
      statusLabel: 'Upcoming drop',
    });
  }

  return out;
}

export function deriveLiveActivityPulse(
  liveRows: LiveStream[],
): readonly { id: string; text: string; time: string }[] {
  if (liveRows.length) {
    return liveRows.slice(0, 4).map((s) => ({
      id: s.id,
      text: `${s.host.name} · ${s.title}`,
      time: s.roomStatus === 'live' ? `${formatCompactCount(s.viewers)} watching` : 'Scheduled',
    }));
  }
  return [
    { id: 'pulse-1', text: 'Vault verified sellers go live daily', time: 'Live hub' },
    { id: 'pulse-2', text: 'Breaks, auctions, and buy-now inventory', time: 'Trending' },
    { id: 'pulse-3', text: 'Collector commerce with authenticated listings', time: 'Vault' },
  ];
}

export function deriveTrendingSales(listings: Product[]): SaleActivity[] {
  return listings.slice(0, 6).map((p) => ({
    id: `trend-${p.id}`,
    item: p.title,
    amount: p.listingPrice,
    channel: p.featuredInLive ? 'Featured on live' : 'In the vault',
    timeAgo: 'Trending',
    imageUrl: p.imageUrl,
    category: p.category,
  }));
}

export function placeholderCommunitySales(): SaleActivity[] {
  return [
    {
      id: 'ph-1',
      item: 'Prizm rookie chase spot',
      amount: 'Live break',
      channel: 'Vault verified',
      timeAgo: 'Heating up',
      imageUrl: undefined,
    },
    {
      id: 'ph-2',
      item: 'Authenticated slab listing',
      amount: 'Buy now',
      channel: 'Marketplace',
      timeAgo: 'New drops',
      imageUrl: undefined,
    },
    {
      id: 'ph-3',
      item: 'Single-card auction',
      amount: 'Ends soon',
      channel: 'Live auction',
      timeAgo: 'This week',
      imageUrl: undefined,
    },
  ];
}

function formatCompactCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
