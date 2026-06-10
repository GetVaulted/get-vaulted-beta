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

function resolveStoredImageUrls(urls: string[] | undefined): string[] {
  if (!urls?.length) return [];
  return urls
    .map((u) => resolveListingImageUrl(u))
    .filter((u): u is string => Boolean(u?.trim()));
}

export function mapStoredListingToProduct(row: WebStoredListing, seller?: Host): Product {
  const imageUrls = resolveStoredImageUrls(row.imageDataUrls);
  const imageUrl = imageUrls[0];
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
    imageUrls: imageUrls.length ? imageUrls : undefined,
    description: row.description?.trim() || undefined,
    vaultVerified: false,
    listingPrice: formatMoney(price),
    conditionGrade: row.condition || undefined,
    seller: host,
    buyNow: formatMoney(price),
    allowOffers: row.allowOffers === true,
    allowLayaway: row.allowLayaway === true,
    acceptTradeOffers: row.acceptTradeOffers === true,
    shippingPriceUsd: row.shippingPriceUsd,
    handlingTimeLabel: row.handlingTime,
  };
}
