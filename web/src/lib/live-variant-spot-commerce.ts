import type {
  LiveActiveSpotCommerceMode,
  LiveItemVariant,
  LiveVariantSpotCommerceDefault,
} from "@/generated/prisma/client";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import { hostPinnedBuyerVariant, variantIsAvailable } from "@/lib/live-item-variant-presets";

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

type VariantPinRow = Pick<LiveItemVariant, "id" | "isHot" | "quantityRemaining" | "status">;

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

/** Buyers checkout pinned spot at fixed price (hold to buy). */
export function isVariantSpotFixedCheckoutLive(item: ItemSpotCommerceRow | null | undefined): boolean {
  if (!item || !isVariantSalesFormat(item.salesFormat)) return false;
  if (isVariantSpotAuctionLive(item)) return false;
  const pinned = hostPinnedBuyerVariant(item.variants ?? [], item.variantAssignmentMode);
  return Boolean(pinned);
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
