import type { LiveRoomItemRow } from '../api/liveRoomControlRepository';
import {
  resolveLiveAuctionLotBidPhase,
  type LiveAuctionLotBidPhase,
} from './liveAuctionLotPhase';

export type LiveAuctionHostStartItem = Pick<
  LiveRoomItemRow,
  'title' | 'quantity' | 'quantityInitial' | 'status' | 'lastHighBidderId' | 'biddingOpen' | 'auctionEndsAt'
>;

function normalizeQuantityInitial(item: Pick<LiveAuctionHostStartItem, 'quantity' | 'quantityInitial'>): number {
  if (typeof item.quantityInitial === 'number' && Number.isFinite(item.quantityInitial) && item.quantityInitial > 0) {
    return Math.floor(item.quantityInitial);
  }
  if (typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0) {
    return Math.floor(item.quantity);
  }
  return 1;
}

export function isMultiQuantityLiveAuctionItem(
  item: Pick<LiveAuctionHostStartItem, 'quantity' | 'quantityInitial'>,
): boolean {
  return normalizeQuantityInitial(item) > 1;
}

export function liveAuctionUnitsRemaining(item: LiveAuctionHostStartItem): number {
  const total = normalizeQuantityInitial(item);
  const remaining =
    typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? Math.max(0, Math.floor(item.quantity)) : total;
  if (item.status === 'sold' || item.status === 'skipped') return 0;
  return remaining;
}

export function liveAuctionHasPendingWinner(
  item: Pick<LiveAuctionHostStartItem, 'lastHighBidderId'>,
  lotBidPhase: LiveAuctionLotBidPhase,
): boolean {
  return lotBidPhase === 'timer_ended_unsettled' && Boolean(item.lastHighBidderId?.trim());
}

export function canHostStartLiveAuction(
  item: LiveAuctionHostStartItem | null | undefined,
  args: {
    roomLive: boolean;
    lotBidPhase: LiveAuctionLotBidPhase;
    isVariantItem?: boolean;
    hasPinnedVariant?: boolean;
    /** PYT/PYD pinned spot — only start timed bids when host switched to auction mode. */
    activeSpotCommerceMode?: 'fixed' | 'auction' | null;
    salesFormat?: string | null;
  },
): boolean {
  if (!item || !args.roomLive || item.status !== 'active') return false;
  if (args.salesFormat === 'buy_now') return false;
  if (args.isVariantItem) {
    if (!args.hasPinnedVariant) return false;
    if (args.lotBidPhase === 'bidding_open') return false;
    if (liveAuctionUnitsRemaining(item) <= 0) return false;
    // Pinned spot starts as fixed (buy now); Start Auction promotes the same team to timed bids.
    return args.lotBidPhase === 'not_started';
  }
  if (liveAuctionUnitsRemaining(item) <= 0) return false;
  if (args.lotBidPhase === 'bidding_open') return false;
  if (liveAuctionHasPendingWinner(item, args.lotBidPhase)) return false;
  if (args.lotBidPhase === 'not_started') return true;
  if (args.lotBidPhase === 'timer_ended_unsettled' && !item.lastHighBidderId?.trim()) return true;
  return false;
}

export function resolveLiveAuctionHostStartLotPhase(
  item: LiveAuctionHostStartItem | null | undefined,
  nowMs: number,
): LiveAuctionLotBidPhase {
  if (!item) return 'inactive';
  return resolveLiveAuctionLotBidPhase(
    {
      status: item.status,
      biddingOpen: item.biddingOpen,
      auctionEndsAt: item.auctionEndsAt,
    },
    nowMs,
  );
}
