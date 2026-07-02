import {
  hostPinnedBuyerVariant,
  isVariantPurchaseItem,
  variantIsAvailable,
} from "@/lib/live-item-variant-presets";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { isVariantSpotAuctionLive } from "@/lib/live-variant-spot-commerce";
import {
  getLiveVariantCheckoutPreview,
  type LiveVariantCheckoutPreview,
} from "@/services/shipping/live-variant-checkout-preview";

export type LiveVariantCheckoutPreviewForRoom = LiveVariantCheckoutPreview & {
  liveRoomItemId: string;
};

export function variantCheckoutPreviewItemPriceUsd(item: LiveRoomItemDTO): number {
  if (!isVariantPurchaseItem(item)) return 0;
  const pinned = hostPinnedBuyerVariant(item.variants, item.variantAssignmentMode);
  if (pinned && pinned.priceUsd > 0) return pinned.priceUsd;
  const prices = item.variants
    .filter((v) => variantIsAvailable(v))
    .map((v) => v.priceUsd)
    .filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length) return Math.min(...prices);
  const fallback = item.priceUsd ?? item.startingBidUsd ?? 0;
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

/** Buyer checkout totals for the active PYT/PYD item (same math as checkout-preview API). */
export async function resolveLiveVariantCheckoutPreviewForActiveItem(args: {
  buyerId: string;
  liveRoomId: string;
  activeItem: LiveRoomItemDTO | null | undefined;
  /** When set, preview for this spot price instead of the pinned/default price. */
  itemPriceUsd?: number | null;
}): Promise<LiveVariantCheckoutPreviewForRoom | null> {
  const item = args.activeItem;
  if (!item || !isVariantPurchaseItem(item)) return null;
  if (isVariantSpotAuctionLive(item)) return null;

  const itemPriceUsd =
    typeof args.itemPriceUsd === "number" && args.itemPriceUsd > 0
      ? Math.round(args.itemPriceUsd * 100) / 100
      : variantCheckoutPreviewItemPriceUsd(item);
  if (itemPriceUsd <= 0) return null;

  const preview = await getLiveVariantCheckoutPreview({
    buyerId: args.buyerId,
    liveRoomId: args.liveRoomId,
    liveRoomItemId: item.id,
    itemPriceUsd,
  });
  if (!preview) return null;
  return { ...preview, liveRoomItemId: item.id };
}
