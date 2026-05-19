import { mapListingCategoryToCategoryId } from './marketplaceListingCategory';
import { resolveListingImageUrl } from './mapWebMarketplaceListing';
import type { WebStoredListing } from './webListingsRepository';
import type { Host, Product } from '../types';

function formatMoney(amount: number): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
      amount,
    );
  } catch {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
  }
}

export function mapStoredListingToProduct(row: WebStoredListing, seller?: Host): Product {
  const imageUrl = resolveListingImageUrl(row.imageDataUrls?.[0]);
  const isAuction = row.buyingFormat === 'auction';
  const price = isAuction ? row.startingBid ?? row.price ?? 0 : row.price ?? 0;
  const cat = mapListingCategoryToCategoryId(row.category ?? 'Other');
  const host: Host =
    seller ??
    ({
      id: row.sellerId,
      name: 'You',
      handle: '@you',
      avatarUrl: '',
      verified: false,
      followers: '—',
    } as Host);

  return {
    id: row.id,
    title: row.title || 'Listing',
    category: cat,
    imageGradient: ['#06080c', '#10141c'] as [string, string],
    imageUrl,
    vaultVerified: false,
    listingPrice: formatMoney(price),
    conditionGrade: row.condition || undefined,
    seller: host,
    buyNow: formatMoney(price),
  };
}
