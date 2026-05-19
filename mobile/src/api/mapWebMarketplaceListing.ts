import { mapListingCategoryToCategoryId } from './marketplaceListingCategory';
import type { WebMarketplaceListing } from './webListingsTypes';
import type { CategoryId, Host, Product } from '../types';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

const FALLBACK_AVATAR =
  'https://images.unsplash.com/photo-1517649763962-0c62306601b7?w=200&q=80&auto=format&fit=crop';

function formatMoney(amount: number): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
      amount,
    );
  } catch {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
  }
}

export function resolveListingImageUrl(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = getWebApiBaseUrl();
  if (base && trimmed.startsWith('/')) return `${base}${trimmed}`;
  return trimmed;
}

function sellerToHost(listing: WebMarketplaceListing): Host {
  const username = listing.sellerUsername?.trim() || 'seller';
  return {
    id: listing.sellerId ?? username,
    name: username,
    handle: `@${username}`,
    avatarUrl: FALLBACK_AVATAR,
    verified: listing.sellerVerified,
    followers: '—',
  };
}

export function mapWebMarketplaceListingToProduct(listing: WebMarketplaceListing): Product {
  const imageUrl = resolveListingImageUrl(listing.imageUrls?.[0]);
  const cat: CategoryId = mapListingCategoryToCategoryId(listing.category);
  const priceLabel = formatMoney(listing.price);
  return {
    id: listing.id,
    title: listing.title || 'Listing',
    category: cat,
    imageGradient: ['#06080c', '#10141c'] as [string, string],
    imageUrl,
    storyline: listing.longDescription?.slice(0, 120) || undefined,
    vaultVerified: Boolean(listing.vaultPick),
    listingPrice: priceLabel,
    conditionGrade: listing.condition || undefined,
    seller: sellerToHost(listing),
    buyNow: priceLabel,
  };
}

export function webCategoryFromMobileCategory(cat: CategoryId): string {
  switch (cat) {
    case 'cards':
      return 'Trading Cards';
    case 'memorabilia':
      return 'Memorabilia';
    case 'watches':
      return 'Watches';
    case 'sneakers':
      return 'Sneakers';
    default:
      return 'Other';
  }
}

export function webShippingCategoryFromMobile(cat: CategoryId | null): string {
  return cat === 'cards' ? 'raw_card' : 'small_collectible';
}
