import type { Prisma } from "@/generated/prisma/client";
import { parseListingInventoryChannel } from "@/lib/listing-inventory-channel";

/** Listings visible on marketplace, seller shop, and commerce flows (not admin-removed). */
export const listingNotModerationRemoved: Prisma.ListingWhereInput = {
  moderationRemovedAt: null,
};

export function isListingPubliclyVisible(row: {
  status: string;
  moderationRemovedAt: Date | null;
  description?: string | null;
}): boolean {
  /** `awaiting_auction_payment` and other non-live statuses stay off the marketplace. */
  const live = row.status === "active" || row.status === "auction_live";
  if (!live || row.moderationRemovedAt != null) return false;
  // Live-show checkout listings are active for Stripe but are not marketplace catalog.
  if (row.description != null && parseListingInventoryChannel(row.description) === "live_show") {
    return false;
  }
  return true;
}

/** Item detail pages may show reserved/sold states with purchase actions disabled. */
export function isListingMarketplaceDetailVisible(row: {
  status: string;
  moderationRemovedAt: Date | null;
  description?: string | null;
}): boolean {
  if (row.moderationRemovedAt != null) return false;
  if (row.description != null && parseListingInventoryChannel(row.description) === "live_show") {
    return false;
  }
  return (
    row.status === "active" ||
    row.status === "auction_live" ||
    row.status === "layaway_reserved" ||
    row.status === "sold"
  );
}
