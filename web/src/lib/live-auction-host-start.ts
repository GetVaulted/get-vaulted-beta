import {
  normalizeQuantityInitial,
  resolveLiveRoomItemQuantityState,
} from "@/lib/live-room-item-quantity-display";
import {
  resolveLiveAuctionLotBidPhase,
  type LiveAuctionLotBidPhase,
} from "@/lib/live-auction-lot-phase";

export type LiveAuctionHostStartItem = {
  title: string;
  quantity: number;
  quantityInitial?: number | null;
  status: string;
  lastHighBidderId?: string | null;
  biddingOpen?: boolean | null;
  auctionEndsAt?: string | null;
};

export function isMultiQuantityLiveAuctionItem(
  item: Pick<LiveAuctionHostStartItem, "quantity" | "quantityInitial">,
): boolean {
  return normalizeQuantityInitial(item) > 1;
}

export function liveAuctionUnitsRemaining(item: LiveAuctionHostStartItem): number {
  return resolveLiveRoomItemQuantityState({
    title: item.title,
    quantity: item.quantity,
    quantityInitial: item.quantityInitial,
    status: item.status,
  }).remainingQuantity;
}

export function liveAuctionHasPendingWinner(
  item: Pick<LiveAuctionHostStartItem, "lastHighBidderId">,
  lotBidPhase: LiveAuctionLotBidPhase,
): boolean {
  return lotBidPhase === "timer_ended_unsettled" && Boolean(item.lastHighBidderId?.trim());
}

/** Host can open a new timed auction round on this lot. */
export function canHostStartLiveAuction(
  item: LiveAuctionHostStartItem | null | undefined,
  args: { roomLive: boolean; lotBidPhase: LiveAuctionLotBidPhase; isVariantItem?: boolean },
): boolean {
  if (!item || args.isVariantItem) return false;
  if (!args.roomLive || item.status !== "active") return false;
  if (liveAuctionUnitsRemaining(item) <= 0) return false;
  if (args.lotBidPhase === "bidding_open") return false;
  if (liveAuctionHasPendingWinner(item, args.lotBidPhase)) return false;
  if (args.lotBidPhase === "not_started") return true;
  if (args.lotBidPhase === "timer_ended_unsettled" && !item.lastHighBidderId?.trim()) return true;
  return false;
}

export function resolveLiveAuctionHostStartLotPhase(
  item: LiveAuctionHostStartItem | null | undefined,
  nowMs: number,
): LiveAuctionLotBidPhase {
  if (!item) return "inactive";
  return resolveLiveAuctionLotBidPhase(
    {
      status: item.status,
      biddingOpen: item.biddingOpen,
      auctionEndsAt: item.auctionEndsAt,
    },
    nowMs,
  );
}
