import type {
  LiveActiveSpotCommerceMode,
  LiveVariantSpotCommerceDefault,
} from "@/generated/prisma/client";
import {
  isVariantSalesFormat,
  hostPinnedBuyerVariant,
  summarizeVariantSpots,
  variantIsAvailable,
  type VariantPinRow,
} from "@/lib/live-item-variant-presets";

export type VariantSpotCommerceDefault = LiveVariantSpotCommerceDefault;
export type ActiveSpotCommerceMode = LiveActiveSpotCommerceMode;

export function parseVariantSpotCommerceDefault(raw: unknown): VariantSpotCommerceDefault {
  if (raw === "fixed" || raw === "auction" || raw === "hybrid") return raw;
  return "hybrid";
}

export function parseActiveSpotCommerceMode(raw: unknown): ActiveSpotCommerceMode | null {
  if (raw === "fixed" || raw === "auction") return raw;
  return null;
}

type ItemSpotCommerceRow = {
  salesFormat: string;
  variantAssignmentMode?: string | null;
  variantSpotCommerceDefault?: VariantSpotCommerceDefault | null;
  activeSpotCommerceMode?: ActiveSpotCommerceMode | null;
  biddingOpen?: boolean | null;
  auctionVariantId?: string | null;
  variants?: VariantPinRow[];
};

/** Pinned spot currently in timed auction (bidding open on that variant). */
export function isVariantSpotAuctionLive(item: ItemSpotCommerceRow | null | undefined): boolean {
  if (!item?.biddingOpen || !item.auctionVariantId?.trim()) return false;
  if (!isVariantSalesFormat(item.salesFormat)) return false;
  return item.activeSpotCommerceMode === "auction";
}

/** Variants buyers can claim via shop while a spot auction may be live on another team. */
export function shopAvailableVariants(item: ItemSpotCommerceRow | null | undefined): VariantPinRow[] {
  const variants = item?.variants ?? [];
  if (!variants.length) return [];
  if (isVariantSpotAuctionLive(item) && item!.auctionVariantId?.trim()) {
    const auctionId = item!.auctionVariantId.trim();
    return variants.filter((v) => v.id !== auctionId && variantIsAvailable(v));
  }
  return variants.filter((v) => variantIsAvailable(v));
}

export function shopVariantCountDuringSpotAuction(item: ItemSpotCommerceRow | null | undefined): number {
  return shopAvailableVariants(item).length;
}

/** Open spot count buyers can claim via shop (respects spot-auction exclusions). */
export function shopAvailableSpotCount(item: ItemSpotCommerceRow | null | undefined): number {
  return summarizeVariantSpots(shopAvailableVariants(item)).available;
}

/** Buyers claim spots via picker sheet (fixed checkout — includes hybrid shop during spot auction). */
export function isVariantSpotFixedCheckoutLive(item: ItemSpotCommerceRow | null | undefined): boolean {
  if (!item || !isVariantSalesFormat(item.salesFormat)) return false;
  return shopAvailableVariants(item).length > 0;
}

/** Host may switch fixed ↔ auction or plain buy_now ↔ auction when commerce is idle. */
export function canHostSwitchSpotCommerceMode(item: {
  biddingOpen?: boolean | null;
  status?: string | null;
} | null | undefined): boolean {
  if (!item || item.status !== "active") return false;
  return item.biddingOpen !== true;
}

/** Default runtime mode when host pins a new spot (hybrid → fixed until Start Auction). */
export function defaultActiveSpotModeForPin(
  variantSpotCommerceDefault: VariantSpotCommerceDefault | null | undefined,
): ActiveSpotCommerceMode {
  if (variantSpotCommerceDefault === "auction") return "auction";
  return "fixed";
}

export function resolvePinnedVariantForAuction(
  item: ItemSpotCommerceRow,
): VariantPinRow | null {
  const pinned = hostPinnedBuyerVariant(item.variants ?? [], item.variantAssignmentMode);
  if (!pinned || !variantIsAvailable(pinned)) return null;
  return pinned;
}

/** Reset item auction + pin commerce when host switches pinned spot. */
export function idleVariantSpotCommerceReset(): {
  biddingOpen: false;
  auctionEndsAt: null;
  currentBidUsd: null;
  lastHighBidderId: null;
  auctionVariantId: null;
  activeSpotCommerceMode: ActiveSpotCommerceMode;
  clutchTimeEnabled: false;
} {
  return {
    biddingOpen: false,
    auctionEndsAt: null,
    currentBidUsd: null,
    lastHighBidderId: null,
    auctionVariantId: null,
    activeSpotCommerceMode: "fixed",
    clutchTimeEnabled: false,
  };
}

export function pinnedVariantAuctionPrimaryLabel(
  format: string | null | undefined,
  nextBidUsd: number,
): string {
  const money = `$${nextBidUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (format === "team_break") return `Bid ${money}`;
  return `Place bid ${money}`;
}
