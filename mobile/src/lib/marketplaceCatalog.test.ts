import { describe, expect, it } from 'vitest';
import {
  buildMarketplaceDiscoveryRails,
  marketplaceRailsHaveUniqueProducts,
} from './marketplaceCatalog';
import type { Product } from '../types';

function mockProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    title: `Listing ${id}`,
    category: 'cards',
    imageGradient: ['#000', '#111'],
    vaultVerified: false,
    listingPrice: '$100',
    seller: { id: 'seller-1', name: 'seller', handle: '@seller', avatarUrl: '', verified: false, followers: '0' },
    ...overrides,
  };
}

describe('buildMarketplaceDiscoveryRails', () => {
  it('never repeats the same listing across rails', () => {
    const catalog = [
      mockProduct('a', { listingPrice: '$500' }),
      mockProduct('b', { listingPrice: '$400' }),
      mockProduct('c', { listingPrice: '$300' }),
      mockProduct('d', { listingPrice: '$200' }),
      mockProduct('e', { listingPrice: '$100' }),
    ];
    const rails = buildMarketplaceDiscoveryRails(catalog);
    expect(marketplaceRailsHaveUniqueProducts(rails)).toBe(true);
  });

  it('spreads a tiny catalog across rows instead of cloning one rail everywhere', () => {
    const catalog = [mockProduct('1'), mockProduct('2'), mockProduct('3')];
    const rails = buildMarketplaceDiscoveryRails(catalog);
    expect(rails.featured.map((p) => p.id)).toEqual(['1', '2']);
    expect(rails.trending.map((p) => p.id)).toEqual(['3']);
    expect(rails.recent).toHaveLength(0);
  });

  it('routes verified and luxury picks into matching rails only', () => {
    const catalog = [
      mockProduct('plain', { category: 'cards' }),
      mockProduct('watch', { category: 'watches', listingPrice: '$9,000' }),
      mockProduct('verified', { vaultVerified: true, listingPrice: '$2,000' }),
    ];
    const rails = buildMarketplaceDiscoveryRails(catalog);
    expect(rails.featured.map((p) => p.id)).toEqual(['plain']);
    expect(rails.luxury.map((p) => p.id)).toEqual(['watch']);
    expect(rails.verified.map((p) => p.id)).toEqual(['verified']);
    expect(marketplaceRailsHaveUniqueProducts(rails)).toBe(true);
  });
});
