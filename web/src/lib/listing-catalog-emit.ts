import { isListingPubliclyVisible } from "@/lib/listing-moderation";
import { emitMarketplaceCatalogChanged } from "@/lib/realtime-emit-server";

export type ListingCatalogSnapshot = {
  status: string;
  moderationRemovedAt: Date | null;
};

export function marketplaceCatalogVisibilityChanged(
  before: ListingCatalogSnapshot,
  after: ListingCatalogSnapshot,
): boolean {
  return isListingPubliclyVisible(before) !== isListingPubliclyVisible(after);
}

/** Broadcast when a listing enters or leaves the public marketplace catalog. */
export function maybeEmitMarketplaceCatalogChanged(args: {
  before: ListingCatalogSnapshot;
  after: ListingCatalogSnapshot;
  listingId: string;
  sellerId?: string;
  reason?: "published" | "unpublished" | "sold" | "moderation" | "deleted" | "updated";
}): void {
  if (!marketplaceCatalogVisibilityChanged(args.before, args.after)) return;
  emitMarketplaceCatalogChanged({
    listingId: args.listingId,
    sellerId: args.sellerId,
    reason: args.reason,
  });
}
