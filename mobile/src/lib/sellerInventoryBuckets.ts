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

/**
 * Classify a seller listing into marketplace vs live show inventory.
 *
 * Prefer the explicit channel marker. Marketplace timed auctions are gone, so auction-format
 * rows without marketplace commerce flags belong in Live show — never dump them into Marketplace.
 */
export function resolveListingInventoryChannel(row: WebStoredListing): ListingChannel {
  if (row.inventoryChannel === 'marketplace' || row.inventoryChannel === 'live_show') {
    return row.inventoryChannel;
  }

  const status = row.status ?? 'draft';
  const marketplaceCommerce = Boolean(row.allowOffers || row.allowLayaway);
  const isAuction = row.buyingFormat === 'auction';

  // Live-show inventory is published as draft + auction (or live auction type).
  if (isAuction && !marketplaceCommerce) {
    return 'live_show';
  }

  if (status === 'draft') {
    if (marketplaceCommerce) return 'marketplace';
    // Ambiguous drafts without channel: live-show lane is the safer default for queue inventory.
    return 'live_show';
  }

  if (status === 'sold') {
    if (isAuction && !marketplaceCommerce) return 'live_show';
    return 'marketplace';
  }

  // active / auction_live / ended / payment states without a marker
  if (marketplaceCommerce || !isAuction) {
    return 'marketplace';
  }
  return 'live_show';
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

/** Live-show inventory is mostly drafts — open that bucket when switching lanes. */
export function defaultInventoryBucketForChannel(channel: ListingChannel): InventoryBucket {
  return channel === 'live_show' ? 'drafts' : 'active';
}
