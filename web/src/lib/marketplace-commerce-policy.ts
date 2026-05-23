import type { BuyingFormat, ListingStatus } from "@/generated/prisma/client";

/** Legacy timed marketplace auction row (pre–buy-now-only policy). */
export function isLegacyMarketplaceTimedAuction(row: {
  buyingFormat: BuyingFormat;
  status: ListingStatus;
}): boolean {
  return row.buyingFormat === "auction" && row.status !== "draft";
}

/** Inventory draft queued for a live show (not a marketplace timed auction). */
export function isLiveShowInventoryDraft(row: {
  buyingFormat: BuyingFormat;
  status: ListingStatus;
}): boolean {
  return row.buyingFormat === "auction" && row.status === "draft";
}

export const MARKETPLACE_AUCTION_DISABLED_MESSAGE =
  "Marketplace timed auctions are no longer available. Use Live Shows for auctions.";

export function isMarketplaceTimedAuctionPublishAttempt(body: {
  buyingFormat: BuyingFormat;
  status: ListingStatus;
}): boolean {
  return (
    body.buyingFormat === "auction" &&
    (body.status === "active" || body.status === "auction_live")
  );
}

/** Public marketplace browse feed — buy-now listings only. */
export const PUBLIC_MARKETPLACE_LISTING_WHERE = {
  status: "active" as const,
  buyingFormat: "buy_now" as const,
  moderationRemovedAt: null,
  isCompanyListing: false,
};
