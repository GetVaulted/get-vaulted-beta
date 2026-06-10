import type { Prisma } from "@/generated/prisma/client";

/** Listings visible on marketplace, seller shop, and commerce flows (not admin-removed). */
export const listingNotModerationRemoved: Prisma.ListingWhereInput = {
  moderationRemovedAt: null,
};

export function isListingPubliclyVisible(row: {
  status: string;
  moderationRemovedAt: Date | null;
}): boolean {
  /** `awaiting_auction_payment` and other non-live statuses stay off the marketplace. */
  const live = row.status === "active" || row.status === "auction_live";
  return live && row.moderationRemovedAt == null;
}

/** Item detail pages may show reserved/sold states with purchase actions disabled. */
export function isListingMarketplaceDetailVisible(row: {
  status: string;
  moderationRemovedAt: Date | null;
}): boolean {
  if (row.moderationRemovedAt != null) return false;
  return (
    row.status === "active" ||
    row.status === "auction_live" ||
    row.status === "layaway_reserved" ||
    row.status === "sold"
  );
}
