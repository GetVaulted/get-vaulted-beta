import type { FeaturedCreator, LiveStream, Product, SaleActivity, ScheduledStream } from '../types';
import { orderScheduledStreamsByStartTime } from './liveDiscoveryOrder';
import {
  filterDisplayableMarketplaceProducts,
  parseListingPriceUsd,
} from './marketplaceListingQuality';

export { parseListingPriceUsd } from './marketplaceListingQuality';

export type HomeCommunityPulseItem = {
  id: string;
  headline: string;
  meta: string;
  avatarUrl?: string;
  displayName?: string;
  imageUrl?: string;
  tone: 'live' | 'listing' | 'event' | 'seller';
};

export type HomeDiscoveryLane = {
  id: string;
  label: string;
  countLabel?: string;
  icon: 'hammer' | 'layers' | 'diamond' | 'calendar' | 'pricetag' | 'time' | 'people';
  gradient: [string, string];
};

export type HomeLiveDealItem = {
  id: string;
  streamId: string;
  title: string;
  subtitle: string;
  priceLabel?: string;
  imageUrl?: string;
  hostName: string;
  kind: 'auction' | 'pinned' | 'break';
};

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

export function deriveLiveHeroStreams(liveRows: LiveStream[]): LiveStream[] {
  return [...liveRows]
    .filter((row) => row.roomStatus === 'live')
    .sort((a, b) => b.viewers - a.viewers || (b.messagesPerMin ?? 0) - (a.messagesPerMin ?? 0));
}

export function deriveUpcomingHeroEvents(scheduledRows: ScheduledStream[]): ScheduledStream[] {
  // `startsAt` is a human display string ("Tomorrow · 3 PM"), so sorting on it via `new Date(...)`
  // yields NaN and leaves the list unordered. Sort on the real ISO start (`scheduledStartAtIso`)
  // so today's drops sit on top and later shows descend chronologically.
  return orderScheduledStreamsByStartTime(scheduledRows);
}

export function deriveHotVaultListings(listings: Product[]): Product[] {
  return [...filterDisplayableMarketplaceProducts(listings)].sort(
    (a, b) => hotVaultScore(b) - hotVaultScore(a),
  );
}

function hotVaultScore(product: Product): number {
  let score = 0;
  if (product.vaultVerified) score += 4;
  if (product.featuredInLive) score += 3;
  if (product.allowOffers) score += 2;
  if (product.auctionEnds) score += 2;
  if (product.conditionGrade) score += 1;
  return score;
}

export function deriveHomeDiscoveryLanes(
  liveRows: LiveStream[],
  scheduledRows: ScheduledStream[],
  listings: Product[],
  verifiedSellers: FeaturedCreator[],
): HomeDiscoveryLane[] {
  const liveAuctions = liveRows.filter(
    (row) => row.liveRoomFormat === 'auction' || row.liveRoomFormat === 'hybrid',
  ).length;
  const breaks = liveRows.filter((row) => row.liveRoomFormat === 'break').length;
  const underFifty = filterDisplayableMarketplaceProducts(listings).filter((p) => {
    const usd = parseListingPriceUsd(p.listingPrice);
    return usd != null && usd <= 50;
  }).length;
  const endingSoon = filterDisplayableMarketplaceProducts(listings).filter((p) =>
    Boolean(p.auctionEnds?.trim()),
  ).length;
  const displayableCount = filterDisplayableMarketplaceProducts(listings).length;

  return [
    {
      id: 'auctions',
      label: 'Live Auctions',
      countLabel: liveAuctions > 0 ? `${liveAuctions} live` : undefined,
      icon: 'hammer',
      gradient: ['#3d1f12', '#120a08'],
    },
    {
      id: 'breaks',
      label: 'Breaks',
      countLabel: breaks > 0 ? `${breaks} live` : undefined,
      icon: 'layers',
      gradient: ['#1a1530', '#090812'],
    },
    {
      id: 'marketplace',
      label: 'The Vault',
      countLabel: displayableCount > 0 ? `${displayableCount} listings` : undefined,
      icon: 'diamond',
      gradient: ['#1a1608', '#0a0906'],
    },
    {
      id: 'drops',
      label: 'Vault Drops',
      countLabel: scheduledRows.length > 0 ? `${scheduledRows.length} soon` : undefined,
      icon: 'calendar',
      gradient: ['#102018', '#060a08'],
    },
    {
      id: 'under50',
      label: 'Under $50',
      countLabel: underFifty > 0 ? `${underFifty} finds` : undefined,
      icon: 'pricetag',
      gradient: ['#102028', '#06090c'],
    },
    {
      id: 'ending',
      label: 'Ending Soon',
      countLabel: endingSoon > 0 ? `${endingSoon} ending` : undefined,
      icon: 'time',
      gradient: ['#281018', '#0c0608'],
    },
    {
      id: 'sellers',
      label: 'New Sellers',
      countLabel: verifiedSellers.length > 0 ? `${verifiedSellers.length} hosts` : undefined,
      icon: 'people',
      gradient: ['#181828', '#080810'],
    },
  ];
}

export function deriveLiveDeals(liveRows: LiveStream[]): HomeLiveDealItem[] {
  const out: HomeLiveDealItem[] = [];
  for (const stream of liveRows.filter((row) => row.roomStatus === 'live')) {
    const pinned = stream.pinnedProductLabel?.trim();
    const pinnedImage = stream.pinnedItemImageUrl?.trim();
    if (pinned) {
      out.push({
        id: `pinned-${stream.id}`,
        streamId: stream.id,
        title: pinned,
        subtitle: stream.host.name,
        priceLabel:
          stream.currentBid > 0
            ? `$${stream.currentBid.toLocaleString()} bid`
            : stream.buyNowPrice != null
              ? `$${stream.buyNowPrice.toLocaleString()} buy now`
              : undefined,
        imageUrl: pinnedImage || stream.previewImageUrl,
        hostName: stream.host.name,
        kind: stream.liveRoomFormat === 'break' ? 'break' : 'pinned',
      });
    } else if (stream.currentBid > 0 && (stream.liveRoomFormat === 'auction' || stream.liveRoomFormat === 'hybrid')) {
      out.push({
        id: `auction-${stream.id}`,
        streamId: stream.id,
        title: stream.currentItem?.trim() || stream.title,
        subtitle: `${stream.host.name} · live auction`,
        priceLabel: `$${stream.currentBid.toLocaleString()} bid`,
        imageUrl: stream.pinnedItemImageUrl?.trim() || stream.previewImageUrl,
        hostName: stream.host.name,
        kind: 'auction',
      });
    } else if (stream.breakMomentumLine?.trim()) {
      out.push({
        id: `break-${stream.id}`,
        streamId: stream.id,
        title: stream.title,
        subtitle: stream.breakMomentumLine.trim(),
        imageUrl: stream.previewImageUrl,
        hostName: stream.host.name,
        kind: 'break',
      });
    }
  }
  return out.slice(0, 8);
}

export function deriveHomeCommunityPulse(
  liveRows: LiveStream[],
  scheduledRows: ScheduledStream[],
  listings: Product[],
  verifiedSellers: FeaturedCreator[],
): HomeCommunityPulseItem[] {
  const out: HomeCommunityPulseItem[] = [];

  for (const stream of liveRows.filter((row) => row.roomStatus === 'live').slice(0, 2)) {
    const viewerMeta = stream.viewers > 0 ? `${formatCompactCount(stream.viewers)} watching · ` : '';
    out.push({
      id: `live-${stream.id}`,
      headline: `${stream.host.name} is live`,
      meta: `${viewerMeta}${stream.title}`,
      avatarUrl: stream.host.avatarUrl,
      displayName: stream.host.name,
      tone: 'live',
    });
  }

  for (const product of filterDisplayableMarketplaceProducts(listings).slice(0, 2)) {
    out.push({
      id: `listing-${product.id}`,
      headline: `New listing · ${product.title}`,
      meta: `${product.listingPrice} · ${product.seller.name}`,
      avatarUrl: product.seller.avatarUrl,
      displayName: product.seller.name,
      imageUrl: product.imageUrl,
      tone: 'listing',
    });
  }

  for (const event of scheduledRows.slice(0, 1)) {
    out.push({
      id: `event-${event.id}`,
      headline: `Upcoming show · ${event.title}`,
      meta: `${event.host.name} · ${formatEventStartsMeta(event.startsAt)}`,
      avatarUrl: event.host.avatarUrl,
      displayName: event.host.name,
      tone: 'event',
    });
  }

  for (const seller of verifiedSellers.filter((s) => s.status === 'live').slice(0, 1)) {
    if (out.some((row) => row.id === `seller-${seller.host.id}`)) continue;
    out.push({
      id: `seller-${seller.host.id}`,
      headline: `${seller.host.name} is on the live floor`,
      meta: seller.specialty,
      avatarUrl: seller.host.avatarUrl,
      displayName: seller.host.name,
      tone: 'seller',
    });
  }

  return out.slice(0, 5);
}

export function deriveFreshInVault(
  listings: Product[],
  followedSellerIds: readonly string[],
  excludeIds: ReadonlySet<string>,
): Product[] {
  const pool = filterDisplayableMarketplaceProducts(listings).filter((p) => !excludeIds.has(p.id));
  if (pool.length === 0) return [];

  const followed = new Set(followedSellerIds.filter(Boolean));
  if (followed.size > 0) {
    const fromFollows = pool.filter((p) => followed.has(p.seller.id));
    if (fromFollows.length >= 2) return fromFollows.slice(0, 8);
  }

  const byCategory = new Map<string, Product[]>();
  for (const product of pool) {
    const bucket = byCategory.get(product.category) ?? [];
    bucket.push(product);
    byCategory.set(product.category, bucket);
  }

  const picked: Product[] = [];
  const categories = [...byCategory.keys()];
  let round = 0;
  while (picked.length < 8 && round < 12) {
    for (const category of categories) {
      const item = byCategory.get(category)?.[round];
      if (item && !picked.some((p) => p.id === item.id)) picked.push(item);
      if (picked.length >= 8) break;
    }
    round += 1;
  }

  return picked.length ? picked : pool.slice(0, 8);
}

/** @deprecated Use deriveFreshInVault */
export function derivePickedForVault(
  listings: Product[],
  followedSellerIds: readonly string[],
): Product[] {
  return deriveFreshInVault(listings, followedSellerIds, new Set());
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

function formatEventStartsMeta(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Scheduled';
  const diff = t - Date.now();
  if (diff <= 0) return 'Starting soon';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 48) return 'Upcoming drop';
  if (h > 0) return `Starts in ${h}h ${m}m`;
  return `Starts in ${m}m`;
}

function formatCompactCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
