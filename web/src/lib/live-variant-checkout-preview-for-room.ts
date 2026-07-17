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

/**
 * Buyer shipping + tax for the active pinned AUCTION or BUY-NOW lot (not PYT/PYD spots — those use
 * `variantCheckoutPreview`). Powers the pinned-box shipping + tax line on mobile and web.
 */
export type LivePinnedShippingTaxDTO = {
  liveRoomItemId: string;
  /** Auction lot (final price unknown until it sells) → clients show "+ Tax" instead of an amount. */
  isAuction: boolean;
  shippingUsd: number;
  shippingDisplay: string;
  taxApplies: boolean;
  taxUsd: number;
  taxDisplay: string;
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

/** Shipping + tax for the active auction / buy-now pinned lot (not PYT/PYD variant spots). */
export async function resolveLivePinnedShippingTaxPreview(args: {
  buyerId: string;
  liveRoomId: string;
  activeItem: LiveRoomItemDTO | null | undefined;
}): Promise<LivePinnedShippingTaxDTO | null> {
  const item = args.activeItem;
  if (!item) return null;
  // PYT/PYD spots already surface shipping + tax through `variantCheckoutPreview`.
  if (isVariantPurchaseItem(item)) return null;

  const isAuction =
    item.salesFormat === "auction" || item.biddingOpen === true || item.currentBidUsd != null;

  const priceCandidate = isAuction
    ? item.currentBidUsd ?? item.startingBidUsd ?? item.priceUsd ?? 0
    : item.priceUsd ?? item.startingBidUsd ?? 0;
  const itemPriceUsd =
    Number.isFinite(priceCandidate) && (priceCandidate ?? 0) > 0
      ? Math.round((priceCandidate as number) * 100) / 100
      : 0;
  if (itemPriceUsd <= 0) return null;

  const preview = await getLiveVariantCheckoutPreview({
    buyerId: args.buyerId,
    liveRoomId: args.liveRoomId,
    liveRoomItemId: item.id,
    itemPriceUsd,
  });
  if (!preview) return null;

  return {
    liveRoomItemId: item.id,
    isAuction,
    shippingUsd: preview.shippingUsd,
    shippingDisplay: preview.shippingDisplay,
    taxApplies: preview.taxApplies,
    taxUsd: preview.taxUsd,
    taxDisplay: preview.taxDisplay,
  };
}
