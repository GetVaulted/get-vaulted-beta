import { describe, expect, it } from 'vitest';
import { LISTING_MAX_PHOTOS } from '../createListing/types';
import { mapWebMarketplaceListingToProduct } from './mapWebMarketplaceListing';
import type { WebMarketplaceListing } from './webListingsTypes';

function tenPhotoUrls(): string[] {
  return Array.from({ length: LISTING_MAX_PHOTOS }, (_, i) => `https://cdn.example.com/listing/photo-${i + 1}.jpg`);
}

function baseListing(imageUrls: string[]): WebMarketplaceListing {
  return {
    id: 'listing-10',
    title: 'Ten photo listing',
    price: 500,
    imageSeed: 'seed',
    imageUrls,
    sellerUsername: 'vaultseller',
    sellerVerified: true,
    category: 'Trading Cards',
    buyingFormat: 'buy_now',
    condition: 'PSA 10',
    listedAt: new Date().toISOString(),
    href: '/listing/listing-10',
  };
}

describe('mapWebMarketplaceListingToProduct imageUrls', () => {
  it('maps all 10 API image URLs without truncation', () => {
    const urls = tenPhotoUrls();
    const product = mapWebMarketplaceListingToProduct(baseListing(urls));

    expect(product.imageUrls).toHaveLength(LISTING_MAX_PHOTOS);
    expect(product.imageUrls).toEqual(urls);
    expect(product.imageUrl).toBe(urls[0]);
  });

  it('preserves upload order from API sortOrder mapping', () => {
    const urls = tenPhotoUrls();
    const product = mapWebMarketplaceListingToProduct(baseListing(urls));
    expect(product.imageUrls?.map((u, i) => u.endsWith(`photo-${i + 1}.jpg`))).toEqual(
      Array(LISTING_MAX_PHOTOS).fill(true),
    );
  });
});

// Legal/compliance audit (2026-07): the "Vault verified" shield badge shown throughout the app
// previously mirrored the seller-settable `vaultPick` editorial flag, so any seller could mark
// their own listing "verified" at creation time. It must reflect the real, backend-computed
// seller trust tier instead.
describe('mapWebMarketplaceListingToProduct vaultVerified', () => {
  it('is false when vaultPick is set but the seller has no verified tier', () => {
    const listing: WebMarketplaceListing = { ...baseListing([]), vaultPick: true, sellerLevel: 'vault_seller' };
    expect(mapWebMarketplaceListingToProduct(listing).vaultVerified).toBe(false);
  });

  it('is false when vaultPick is set and sellerLevel is absent', () => {
    const listing: WebMarketplaceListing = { ...baseListing([]), vaultPick: true };
    expect(mapWebMarketplaceListingToProduct(listing).vaultVerified).toBe(false);
  });

  it('is true when the seller has reached the vault_verified tier, regardless of vaultPick', () => {
    const listing: WebMarketplaceListing = { ...baseListing([]), vaultPick: false, sellerLevel: 'vault_verified' };
    expect(mapWebMarketplaceListingToProduct(listing).vaultVerified).toBe(true);
  });

  it('is true for elite_vault_verified sellers', () => {
    const listing: WebMarketplaceListing = { ...baseListing([]), sellerLevel: 'elite_vault_verified' };
    expect(mapWebMarketplaceListingToProduct(listing).vaultVerified).toBe(true);
  });
});
