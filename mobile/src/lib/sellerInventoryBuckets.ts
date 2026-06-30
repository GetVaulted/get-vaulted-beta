import type { ListingChannel } from '../createListing/listingChannel';
import type { ListingPreview } from '../createListing/types';
import type { WebStoredListing } from '../api/webListingsRepository';

export type InventoryBucket = 'active' | 'drafts' | 'sold';

export const INVENTORY_BUCKET_LABELS: Record<InventoryBucket, string> = {
  active: 'Active',
  drafts: 'Drafts',
  sold: 'Sold',
};

export function inventoryBucketForPreviewStatus(status: ListingPreview['status']): InventoryBucket {
  if (status === 'draft') return 'drafts';
  if (status === 'sold') return 'sold';
  return 'active';
}

/** Classify a seller listing row into marketplace vs live show inventory. */
export function resolveListingInventoryChannel(row: WebStoredListing): ListingChannel {
  if (row.inventoryChannel === 'marketplace' || row.inventoryChannel === 'live_show') {
    return row.inventoryChannel;
  }

  const status = row.status ?? 'draft';

  if (
    status === 'active' ||
    status === 'auction_live' ||
    status === 'ended' ||
    status === 'awaiting_auction_payment' ||
    status === 'auction_ended_unpaid' ||
    status === 'layaway_reserved'
  ) {
    return 'marketplace';
  }

  if (status === 'draft') {
    if (row.allowOffers || row.allowLayaway || row.inventoryChannel === 'marketplace') {
      return 'marketplace';
    }
    if (row.inventoryChannel === 'live_show') return 'live_show';
    return 'live_show';
  }

  if (status === 'sold') {
    if (row.inventoryChannel === 'live_show') return 'live_show';
    if (row.inventoryChannel === 'marketplace') return 'marketplace';
    if (row.allowOffers || row.allowLayaway) return 'marketplace';
    return 'marketplace';
  }

  return 'marketplace';
}

export function bucketListings(
  listings: ListingPreview[],
  channel: ListingChannel,
  bucket: InventoryBucket,
): ListingPreview[] {
  return listings.filter(
    (l) => (l.channel ?? 'marketplace') === channel && inventoryBucketForPreviewStatus(l.status) === bucket,
  );
}

export function countBucket(
  listings: ListingPreview[],
  channel: ListingChannel,
  bucket: InventoryBucket,
): number {
  return bucketListings(listings, channel, bucket).length;
}
