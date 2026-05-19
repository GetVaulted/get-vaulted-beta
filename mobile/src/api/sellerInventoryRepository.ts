import type { ListingChannel } from '../createListing/listingChannel';
import type { ListingPreview } from '../createListing/types';
import { resolveListingImageUrl } from './mapWebMarketplaceListing';
import {
  fetchListingWorkspaceFromWeb,
  fetchMyListingsFromWeb,
  type WebStoredListing,
} from './webListingsRepository';

function formatMoney(amount: number): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
      amount,
    );
  } catch {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
  }
}

function formatStoredPrice(row: WebStoredListing): string {
  const isAuction = row.buyingFormat === 'auction';
  const amount = isAuction ? row.startingBid ?? row.price ?? 0 : row.price ?? 0;
  return formatMoney(amount);
}

function mapStoredStatus(row: WebStoredListing): ListingPreview['status'] {
  const s = row.status;
  switch (s) {
    case 'draft':
      return 'draft';
    case 'sold':
      return 'sold';
    case 'ended':
      return 'ended';
    case 'auction_live':
      return 'in_auction';
    case 'awaiting_auction_payment':
    case 'auction_ended_unpaid':
      return 'pending';
    case 'active':
      return row.buyingFormat === 'auction' ? 'in_auction' : 'active';
    default:
      return row.buyingFormat === 'auction' ? 'in_auction' : 'active';
  }
}

function storedToPreview(row: WebStoredListing, channel: ListingChannel): ListingPreview {
  return {
    id: row.id,
    title: row.title?.trim() || 'Untitled listing',
    imageUrl: resolveListingImageUrl(row.imageDataUrls?.[0]) ?? '',
    price: formatStoredPrice(row),
    status: mapStoredStatus(row),
    watches: row.watchers ?? 0,
    channel,
    live: channel === 'live_show',
  };
}

function isSellerMarketplaceInventory(row: WebStoredListing): boolean {
  const s = row.status;
  return s === 'active' || s === 'auction_live' || s === 'ended';
}

function isLiveShowQueue(row: WebStoredListing): boolean {
  return row.status === 'draft';
}

export type SellerInventorySnapshot = {
  marketplace: ListingPreview[];
  liveShow: ListingPreview[];
};

export async function fetchSellerInventoryFromWeb(accessToken: string): Promise<SellerInventorySnapshot> {
  console.log('[inventory] fetch seller marketplace listings');
  console.log('[inventory] fetch live queue');

  const [mine, workspace] = await Promise.all([
    fetchMyListingsFromWeb(accessToken),
    fetchListingWorkspaceFromWeb(accessToken),
  ]);

  const workspaceId = workspace?.id ?? null;

  const marketplace = mine
    .filter((row) => isSellerMarketplaceInventory(row))
    .map((row) => storedToPreview(row, 'marketplace'));

  const liveShow = mine
    .filter((row) => isLiveShowQueue(row) && row.id !== workspaceId)
    .map((row) => storedToPreview(row, 'live_show'));

  console.log(`[inventory] hydrated ${marketplace.length} marketplace listings`);
  console.log(`[inventory] hydrated ${liveShow.length} live show listings`);

  return { marketplace, liveShow };
}
