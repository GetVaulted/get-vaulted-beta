import { mapListingCategoryToCategoryId } from './marketplaceListingCategory';
import type { WebMarketplaceListing } from './webListingsTypes';
import type { CategoryId, Host, Product } from '../types';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

import { isTradeOnlyWebListing } from '../lib/listingCommerceMode';
import { formatMarketplaceUsd } from '../lib/formatMarketplaceUsd';

function stripInventoryMarker(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\n?<!--gv-inventory:(marketplace|live_show)-->/g, '').trimEnd() || undefined;
}

// "Vault verified" implies Get Vaulted has verified the seller — it must reflect the seller's
// real, backend-computed trust tier (payout history / instant-payout eligibility), never the
// seller-settable `vaultPick` editorial/featured flag (legal/compliance audit 2026-07).
function isVerifiedSellerLevel(sellerLevel: WebMarketplaceListing['sellerLevel']): boolean {
  return sellerLevel === 'vault_verified' || sellerLevel === 'elite_vault_verified';
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
    avatarUrl: '',
    verified: listing.sellerVerified,
    followers: '—',
  };
}

function resolveListingImageUrls(urls: string[] | undefined): string[] {
  if (!urls?.length) return [];
  return urls
    .map((u) => resolveListingImageUrl(u))
    .filter((u): u is string => Boolean(u?.trim()));
}

export function mapWebMarketplaceListingToProduct(listing: WebMarketplaceListing): Product {
  const imageUrls = resolveListingImageUrls(listing.imageUrls);
  const imageUrl = imageUrls[0];
  const cat: CategoryId = mapListingCategoryToCategoryId(listing.category);
  const tradeOnly = isTradeOnlyWebListing(listing);
  const priceLabel = tradeOnly ? 'Trade offers' : formatMarketplaceUsd(listing.price);
  return {
    id: listing.id,
    title: listing.title?.trim() || '',
    category: cat,
    imageGradient: ['#06080c', '#10141c'] as [string, string],
    imageUrl,
    imageUrls: imageUrls.length ? imageUrls : undefined,
    description: stripInventoryMarker(listing.longDescription),
    storyline: stripInventoryMarker(listing.longDescription)?.slice(0, 120) || undefined,
    vaultVerified: isVerifiedSellerLevel(listing.sellerLevel),
    listingPrice: priceLabel,
    conditionGrade: listing.condition || undefined,
    seller: sellerToHost(listing),
    buyNow: tradeOnly ? undefined : priceLabel,
    tradeOnly,
    allowOffers: listing.allowOffers === true,
    allowLayaway: listing.allowLayaway === true,
    acceptTradeOffers: listing.acceptTradeOffers === true,
    listingStatus: listing.listingStatus,
    sellerLevel: listing.sellerLevel,
    sellerLevelLabel: listing.sellerLevelLabel,
    shippingPriceUsd: listing.shippingPriceUsd,
    handlingTimeLabel: listing.handlingTimeLabel,
    signatureRequired: listing.signatureRequired,
    shipsFromRegion: listing.shipsFromRegion,
    sellerCompletedOrderCount:
      typeof listing.sellerCompletedOrderCount === 'number' && Number.isFinite(listing.sellerCompletedOrderCount)
        ? Math.max(0, Math.floor(listing.sellerCompletedOrderCount))
        : undefined,
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
