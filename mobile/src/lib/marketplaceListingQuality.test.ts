import { describe, expect, it } from 'vitest';
import {
  filterDisplayableMarketplaceProducts,
  isBrowsableMarketplaceProduct,
  isDisplayableMarketplaceProduct,
} from './marketplaceListingQuality';
import type { Product } from '../types';

function baseProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'listing-valid-1',
    title: '2020 Prizm Silver Rookie PSA 10',
    listingPrice: '$125',
    imageUrl: 'https://cdn.example.com/card.jpg',
    imageUrls: ['https://cdn.example.com/card.jpg'],
    imageGradient: ['#111', '#222'],
    category: 'cards',
    seller: {
      id: 'seller-1',
      name: 'Vault Seller',
      handle: '@vaultseller',
      avatarUrl: '',
      verified: true,
    },
    vaultVerified: false,
    featuredInLive: false,
    allowOffers: false,
    ...overrides,
  } as Product;
}

describe('marketplaceListingQuality', () => {
  it('accepts a complete marketplace listing', () => {
    expect(isDisplayableMarketplaceProduct(baseProduct())).toBe(true);
  });

  it('rejects junk test titles from the catalog', () => {
    expect(isDisplayableMarketplaceProduct(baseProduct({ title: 'Cake' }))).toBe(false);
    expect(isDisplayableMarketplaceProduct(baseProduct({ title: 'Good' }))).toBe(false);
    expect(isDisplayableMarketplaceProduct(baseProduct({ title: 'ank' }))).toBe(false);
    expect(isDisplayableMarketplaceProduct(baseProduct({ title: 'Yummy cake' }))).toBe(false);
  });

  it('rejects listings missing price, image, or seller', () => {
    expect(isDisplayableMarketplaceProduct(baseProduct({ listingPrice: '' }))).toBe(false);
    expect(
      isDisplayableMarketplaceProduct(
        baseProduct({ imageUrl: '', imageUrls: [] }),
      ),
    ).toBe(false);
    expect(
      isDisplayableMarketplaceProduct(
        baseProduct({ seller: { ...baseProduct().seller, id: '' } }),
      ),
    ).toBe(false);
  });

  it('filters arrays to displayable listings only', () => {
    const filtered = filterDisplayableMarketplaceProducts([
      baseProduct(),
      baseProduct({ id: 'junk-1', title: 'Cake' }),
      baseProduct({ id: 'junk-2', title: 'Good' }),
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.title).toContain('Prizm');
  });

  it('allows published test listings in The Vault but hides junk from home rails', () => {
    const testListing = baseProduct({
      id: 'test-1',
      title: 'Cake',
      listingPrice: '$25',
    });
    expect(isBrowsableMarketplaceProduct(testListing)).toBe(true);
    expect(isDisplayableMarketplaceProduct(testListing)).toBe(false);
  });

  it('rejects broken rows from browse feed', () => {
    expect(isBrowsableMarketplaceProduct(baseProduct({ title: '' }))).toBe(false);
    expect(isBrowsableMarketplaceProduct(baseProduct({ listingPrice: '' }))).toBe(false);
    expect(
      isBrowsableMarketplaceProduct(baseProduct({ imageUrl: '', imageUrls: [] })),
    ).toBe(false);
  });
});
