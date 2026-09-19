import { parseListingInventoryChannel, type ListingInventoryChannel } from "@/lib/listing-inventory-channel";
import { LISTING_WORKSPACE_KEY } from "@/lib/listing-workspace";
import type { BuyingFormat, ListingStatus } from "@/generated/prisma/client";

export type LiveShopInventoryListingRow = {
  id: string;
  title: string;
  imageUrl: string;
  priceUsd: number | null;
  startingBidUsd: number | null;
  buyingFormat: BuyingFormat;
  status: ListingStatus;
  inventoryChannel: ListingInventoryChannel;
  platformShippingProfileId: string | null;
  alreadyInQueue: boolean;
  inventoryHeld: boolean;
  available: boolean;
};

export type ListingForLiveQueue = {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  buyingFormat: BuyingFormat;
  status: ListingStatus;
  priceUsd: number;
  startingBidUsd: number | null;
  workspaceKey: string | null;
  moderationRemovedAt: Date | null;
  platformShippingProfileId: string | null;
  images: { url: string; sortOrder: number }[];
};

/** Statuses that can still be pulled into a live queue. */
const PULLABLE_STATUSES: ListingStatus[] = ["draft", "active", "auction_live"];

export function isListingPullableIntoLiveQueue(listing: {
  status: ListingStatus;
  workspaceKey: string | null;
  moderationRemovedAt: Date | null;
}): boolean {
  if (listing.workspaceKey === LISTING_WORKSPACE_KEY) return false;
  if (listing.moderationRemovedAt) return false;
  return PULLABLE_STATUSES.includes(listing.status);
}

/**
 * Shop picker eligibility: live_show inventory (usually draft) + published/active marketplace,
 * excluding workspace autosave and terminal statuses.
 */
export function isListingEligibleForShopPicker(listing: {
  status: ListingStatus;
  buyingFormat: BuyingFormat;
  workspaceKey: string | null;
  moderationRemovedAt: Date | null;
  description: string;
}): boolean {
  if (!isListingPullableIntoLiveQueue(listing)) return false;
  const channel = parseListingInventoryChannel(listing.description) ?? "marketplace";
  if (channel === "live_show") return true;
  return listing.status === "active" || listing.status === "auction_live";
}

export function listingPrimaryImageUrl(listing: { images: { url: string; sortOrder: number }[] }): string {
  const sorted = [...listing.images].sort((a, b) => a.sortOrder - b.sortOrder);
  return (sorted[0]?.url ?? "").trim();
}

export function salesFormatFromListingBuyingFormat(
  buyingFormat: BuyingFormat,
): "auction" | "buy_now" {
  return buyingFormat === "auction" ? "auction" : "buy_now";
}

export type ResolvedListingQueueFields = {
  title: string;
  imageUrl: string;
  priceUsd: number | null;
  startingBidUsd: number;
  salesFormat: "auction" | "buy_now";
  shippingProfileId: string | null;
};

/**
 * Merge host overrides with listing defaults when creating a listing-backed queue row.
 * Body fields win when provided; otherwise listing values fill gaps.
 */
export function resolveListingBackedQueueFields(args: {
  listing: ListingForLiveQueue;
  title?: string;
  imageUrl?: string;
  priceUsd?: number | null;
  startingBidUsd?: number | null;
  salesFormat?: string | null;
  shippingProfileId?: string | null;
}): { ok: true; fields: ResolvedListingQueueFields } | { ok: false; error: string } {
  const { listing } = args;
  if (!isListingPullableIntoLiveQueue(listing)) {
    return { ok: false, error: "That listing is not available to add to a live show." };
  }

  const title = (args.title?.trim() || listing.title.trim()).slice(0, 300);
  if (!title) return { ok: false, error: "Title is required." };

  const imageUrl = (args.imageUrl?.trim() || listingPrimaryImageUrl(listing)).slice(0, 2000);
  if (!imageUrl) return { ok: false, error: "That listing needs a photo before you can add it to a show." };

  const salesFormatRaw = typeof args.salesFormat === "string" ? args.salesFormat.trim() : "";
  const salesFormat =
    salesFormatRaw === "auction" || salesFormatRaw === "buy_now"
      ? salesFormatRaw
      : salesFormatFromListingBuyingFormat(listing.buyingFormat);

  const priceUsd =
    typeof args.priceUsd === "number" && Number.isFinite(args.priceUsd)
      ? args.priceUsd
      : salesFormat === "buy_now"
        ? listing.priceUsd
        : null;

  const startingFromBody =
    typeof args.startingBidUsd === "number" && Number.isFinite(args.startingBidUsd) && args.startingBidUsd > 0
      ? args.startingBidUsd
      : null;
  const startingBidUsd =
    startingFromBody ??
    (typeof listing.startingBidUsd === "number" && listing.startingBidUsd > 0
      ? listing.startingBidUsd
      : listing.priceUsd > 0
        ? listing.priceUsd
        : 1);

  const shippingProfileId =
    typeof args.shippingProfileId === "string" && args.shippingProfileId.trim()
      ? args.shippingProfileId.trim()
      : listing.platformShippingProfileId;

  return {
    ok: true,
    fields: {
      title,
      imageUrl,
      priceUsd: salesFormat === "buy_now" ? priceUsd : null,
      startingBidUsd,
      salesFormat,
      shippingProfileId,
    },
  };
}
