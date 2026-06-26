import { resolveLiveAuctionLotBidPhase } from './liveAuctionLotPhase';
import { resolvePinnedLotOverlayPrice } from './liveAuctionOverlayPrice';
import { isVariantPurchaseItem, summarizeVariantSpots } from './liveItemVariant';
import type { LiveItemSalesFormat, LiveItemVariantSnapshot } from '../api/liveRoomBuyerRepository';

export type LiveRoomLineupItemSnapshot = {
  id: string;
  displayTitle: string;
  metaLine: string;
  imageUrl: string | null;
  salesFormat: LiveItemSalesFormat;
  sortOrder: number;
  status: string;
  isPinned: boolean;
  isLiveBidding: boolean;
  listingId: string | null;
  queueAction: 'pre_bid' | 'buy_now' | 'none';
  startingBidUsd: number | null;
  currentBidUsd: number | null;
  lastHighBidderId: string | null;
  biddingOpen: boolean;
};

type LineupItemInput = {
  id: string;
  title?: string;
  displayTitle?: string | null;
  progressLabel?: string | null;
  imageUrl?: string | null;
  priceUsd?: number | null;
  startingBidUsd?: number | null;
  currentBidUsd?: number | null;
  lastHighBidderId?: string | null;
  lastHighBidderUsername?: string | null;
  status?: string;
  sortOrder?: number;
  biddingOpen?: boolean;
  auctionEndsAt?: string | null;
  salesFormat?: string;
  variants?: LiveItemVariantSnapshot[];
  listingId?: string | null;
  createdAt?: string;
};

function isPreBidEligible(item: LineupItemInput): boolean {
  const salesFormat = item.salesFormat ?? 'auction';
  if (salesFormat === 'buy_now' || salesFormat === 'variant_selection' || salesFormat === 'team_break') {
    return false;
  }
  if (item.listingId?.trim()) return false;
  if (item.biddingOpen) return false;
  return item.status === 'active' || item.status === 'queued';
}

function queueActionForItem(item: LineupItemInput): LiveRoomLineupItemSnapshot['queueAction'] {
  if ((item.salesFormat ?? 'auction') === 'buy_now') return 'buy_now';
  if (isPreBidEligible(item)) return 'pre_bid';
  return 'none';
}

function displayTitle(item: LineupItemInput): string {
  const base =
    (typeof item.displayTitle === 'string' && item.displayTitle.trim()) ||
    (typeof item.title === 'string' && item.title.trim()) ||
    'Untitled lot';
  return item.progressLabel?.trim() ? `${base} · ${item.progressLabel.trim()}` : base;
}

export function filterHostAlignedLineupItems<T extends { status?: string }>(items: T[]): T[] {
  return items.filter((i) => i.status !== 'sold' && i.status !== 'skipped');
}

export function buildBuyerQueueLineupRow(
  item: LineupItemInput,
  args: { nowMs: number },
): LiveRoomLineupItemSnapshot {
  const title = displayTitle(item);
  const salesFormat = (item.salesFormat ?? 'auction') as LiveItemSalesFormat;
  const isPinned = item.status === 'active';
  const bidPhase = resolveLiveAuctionLotBidPhase(
    { status: item.status ?? 'queued', biddingOpen: item.biddingOpen, auctionEndsAt: item.auctionEndsAt },
    args.nowMs,
  );
  const isLiveBidding = bidPhase === 'bidding_open';
  const listingId = item.listingId?.trim() || null;
  const queueAction = queueActionForItem(item);
  const biddingOpen = item.biddingOpen === true;

  if (salesFormat === 'buy_now') {
    const price = resolvePinnedLotOverlayPrice({ commerceMode: 'buy_now', priceUsd: item.priceUsd });
    return {
      id: item.id,
      displayTitle: title,
      metaLine: `Buy now · ${price.amountFormatted}`,
      imageUrl: item.imageUrl?.trim() || null,
      salesFormat,
      sortOrder: item.sortOrder ?? 0,
      status: item.status ?? 'queued',
      isPinned,
      isLiveBidding: false,
      listingId,
      queueAction,
      startingBidUsd: typeof item.startingBidUsd === 'number' ? item.startingBidUsd : null,
      currentBidUsd: typeof item.currentBidUsd === 'number' ? item.currentBidUsd : null,
      lastHighBidderId: item.lastHighBidderId?.trim() || null,
      biddingOpen,
    };
  }

  if (isVariantPurchaseItem({ salesFormat: item.salesFormat, variants: item.variants })) {
    const spotStats = summarizeVariantSpots(
      (item.variants ?? []).map((v) => ({
        priceUsd: v.priceUsd,
        quantityRemaining: v.quantityRemaining,
        status: v.status,
        soldCount: v.soldCount,
      })),
    );
    const price = resolvePinnedLotOverlayPrice({
      salesFormat: item.salesFormat,
      variants: item.variants,
      status: item.status,
    });
    const spotCopy =
      spotStats.available > 0
        ? `${spotStats.available} spot${spotStats.available === 1 ? '' : 's'} open`
        : 'Sold out';
    const statusCopy = isPinned ? 'On screen' : 'Up next';
    return {
      id: item.id,
      displayTitle: title,
      metaLine: `${price.amountFormatted === 'Sold out' ? 'Sold out' : `From ${price.amountFormatted}`} · ${spotCopy} · ${statusCopy}`,
      imageUrl: item.imageUrl?.trim() || null,
      salesFormat,
      sortOrder: item.sortOrder ?? 0,
      status: item.status ?? 'queued',
      isPinned,
      isLiveBidding: false,
      listingId,
      queueAction: 'none',
      startingBidUsd: typeof item.startingBidUsd === 'number' ? item.startingBidUsd : null,
      currentBidUsd: typeof item.currentBidUsd === 'number' ? item.currentBidUsd : null,
      lastHighBidderId: item.lastHighBidderId?.trim() || null,
      biddingOpen,
    };
  }

  const price = resolvePinnedLotOverlayPrice({
    commerceMode: 'auction',
    status: item.status,
    currentBidUsd: item.currentBidUsd,
    startingBidUsd: item.startingBidUsd,
    priceUsd: item.priceUsd,
    lastHighBidderId: item.lastHighBidderId,
    lastHighBidderUsername: item.lastHighBidderUsername,
  });

  let statusCopy = 'Up next';
  if (isLiveBidding) statusCopy = 'Live';
  else if (isPinned) statusCopy = 'Pre-bid';

  const pricePrefix =
    price.kind === 'current' ? 'Current bid' : price.kind === 'opening' ? 'Opening bid' : price.label;

  return {
    id: item.id,
    displayTitle: title,
    metaLine: `${pricePrefix} ${price.amountFormatted} · ${statusCopy}`,
    imageUrl: item.imageUrl?.trim() || null,
    salesFormat,
    sortOrder: item.sortOrder ?? 0,
    status: item.status ?? 'queued',
    isPinned,
    isLiveBidding,
    listingId,
    queueAction,
    startingBidUsd: typeof item.startingBidUsd === 'number' ? item.startingBidUsd : null,
    currentBidUsd: typeof item.currentBidUsd === 'number' ? item.currentBidUsd : null,
    lastHighBidderId: item.lastHighBidderId?.trim() || null,
    biddingOpen,
  };
}

export function projectBuyerQueueLineup(items: LineupItemInput[], nowMs: number): LiveRoomLineupItemSnapshot[] {
  const sorted = [...filterHostAlignedLineupItems(items)].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || Date.parse(a.createdAt ?? '') - Date.parse(b.createdAt ?? ''),
  );
  return sorted.map((item) => buildBuyerQueueLineupRow(item, { nowMs }));
}
