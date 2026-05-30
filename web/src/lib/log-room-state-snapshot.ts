import { isVariantSalesFormat, summarizeVariantSpots } from "@/lib/live-item-variant-presets";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import type { BreakBuyerPhase } from "@/lib/live-room-break-public";

type HostQueueRow = {
  item: LiveRoomItemDTO;
};

/** Structured seller host-console snapshot log for cross-client state debugging. */
export function logSellerRoomStateSnapshot(args: {
  source: string;
  roomId: string;
  roomStatus: string;
  roomType: string;
  activeItem: LiveRoomItemDTO | null;
  overlayItem: LiveRoomItemDTO | null;
  breakPhase?: BreakBuyerPhase | null;
  lockPurchases?: boolean;
  breakPaused?: boolean;
  serverNowMs: number;
  extra?: Record<string, unknown>;
}): void {
  const { activeItem, overlayItem } = args;
  const overlayVariant = overlayItem && isVariantSalesFormat(overlayItem.salesFormat);
  const activeVariant = activeItem && isVariantSalesFormat(activeItem.salesFormat);
  const overlayStats = overlayVariant ? summarizeVariantSpots(overlayItem?.variants) : null;
  const activeStats = activeVariant ? summarizeVariantSpots(activeItem?.variants) : null;

  console.info("[room state] seller snapshot", {
    source: args.source,
    roomId: args.roomId,
    roomStatus: args.roomStatus,
    roomType: args.roomType,
    activeItemId: activeItem?.id ?? null,
    activeItemTitle: activeItem?.displayTitle ?? activeItem?.title ?? null,
    overlayItemId: overlayItem?.id ?? null,
    overlayDiffersFromActive: Boolean(
      activeItem?.id && overlayItem?.id && activeItem.id !== overlayItem.id,
    ),
    activeItemSalesFormat: activeItem?.salesFormat ?? null,
    lotBidPhase: activeItem
      ? {
          biddingOpen: activeItem.biddingOpen,
          auctionEndsAt: activeItem.auctionEndsAt,
          status: activeItem.status,
        }
      : null,
    breakPhase: args.breakPhase ?? null,
    breakStatus: {
      lockPurchases: args.lockPurchases ?? false,
      paused: args.breakPaused ?? false,
    },
    divisionClaimPhase: overlayVariant ? "variant_spot_sale" : null,
    purchasesLocked: args.lockPurchases ?? false,
    availableDivisionsOrSpots: overlayStats?.available ?? activeStats?.available ?? null,
    activeAvailableSpots: activeStats?.available ?? null,
    snapshotUpdatedAtMs: args.serverNowMs,
    serverNowMs: args.serverNowMs,
    ...args.extra,
  });
}
