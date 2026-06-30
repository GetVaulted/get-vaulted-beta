import type { ListingChannel } from '../createListing/listingChannel';
import type { ListingPreview } from '../createListing/types';
import { resolveListingInventoryChannel } from '../lib/sellerInventoryBuckets';
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

export type SellerInventorySnapshot = {
  marketplace: ListingPreview[];
  liveShow: ListingPreview[];
  all: ListingPreview[];
};

export async function fetchSellerInventoryFromWeb(accessToken: string): Promise<SellerInventorySnapshot> {
  const [mine, workspace] = await Promise.all([
    fetchMyListingsFromWeb(accessToken),
    fetchListingWorkspaceFromWeb(accessToken),
  ]);

  const workspaceId = workspace?.id ?? null;
  const rows = mine.filter((row) => row.id !== workspaceId);

  const all = rows.map((row) => {
    const channel = resolveListingInventoryChannel(row);
    return storedToPreview(row, channel);
  });

  const marketplace = all.filter((l) => l.channel === 'marketplace');
  const liveShow = all.filter((l) => l.channel === 'live_show');

  return { marketplace, liveShow, all };
}
