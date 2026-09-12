import { describe, expect, it } from 'vitest';
import { LISTING_MAX_PHOTOS } from '../createListing/types';
import { enrichListing } from './productListingEnrichment';
import type { Product } from '../types';

const baseProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'l1',
  title: 'Grail card',
  category: 'cards',
  imageGradient: ['#000', '#111'],
  vaultVerified: false,
  listingPrice: '$500',
  seller: {
    id: 's1',
    name: 'seller',
    handle: '@seller',
    avatarUrl: '',
    verified: false,
    followers: '—',
  },
  ...overrides,
});

describe('enrichListing', () => {
  it('maps each unique image URL to a gallery slide', () => {
    const vm = enrichListing(
      baseProduct({
        imageUrls: ['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg'],
        imageUrl: 'https://a/1.jpg',
      }),
    );
    expect(vm.gallery).toHaveLength(3);
    expect(vm.gallery.map((g) => g.uri)).toEqual(['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg']);
  });

  it('enrichment gallery exposes all 10 photos for product detail UI', () => {
    const urls = Array.from({ length: LISTING_MAX_PHOTOS }, (_, i) => `https://a/${i + 1}.jpg`);
    const vm = enrichListing(
      baseProduct({
        imageUrls: urls,
        imageUrl: urls[0],
      }),
    );
    expect(vm.gallery).toHaveLength(LISTING_MAX_PHOTOS);
    expect(vm.gallery.map((g) => g.uri)).toEqual(urls);
  });

  it('does not expose standard seller verification copy to buyers', () => {
    const vm = enrichListing(baseProduct());
    const serialized = JSON.stringify(vm);
    expect(serialized.toLowerCase()).not.toContain('standard seller verification');
    expect(vm.sellerLevelBadge).toBeNull();
  });

  it('shows public seller level badge when provided', () => {
    const vm = enrichListing(
      baseProduct({
        sellerLevel: 'trusted_seller',
        sellerLevelLabel: 'Trusted Seller',
      }),
    );
    expect(vm.sellerLevelBadge).toBe('Trusted Seller');
  });

  it('hides live appearances when none exist', () => {
    const vm = enrichListing(baseProduct());
    expect(vm.liveAppearances).toEqual([]);
  });

  it('passes through real live appearances', () => {
    const vm = enrichListing(
      baseProduct({
        liveAppearances: [{ id: 'live-1', title: 'Friday night break', subtitle: 'Pinned lot' }],
      }),
    );
    expect(vm.liveAppearances).toHaveLength(1);
    expect(vm.liveAppearances[0]?.title).toBe('Friday night break');
  });

  it('surfaces listing description in content', () => {
    const vm = enrichListing(
      baseProduct({
        description: 'Factory sealed.\nIncludes COA.',
      }),
    );
    expect(vm.content.description).toBe('Factory sealed.\nIncludes COA.');
  });

  it('does not treat $0 listing shipping as a paid flat rate', () => {
    const vm = enrichListing(baseProduct({ shippingPriceUsd: 0, handlingTimeLabel: '1–2 days' }));
    expect(vm.content.shippingProtection?.toLowerCase()).toContain('calculated at checkout');
    expect(vm.content.shippingProtection).not.toMatch(/\$0/);
  });

  it('uses trade-specific shipping copy for trade-only listings', () => {
    const vm = enrichListing(baseProduct({ tradeOnly: true, shippingPriceUsd: 0 }));
    expect(vm.content.shippingProtection?.toLowerCase()).toContain('each party buys their own');
  });
});
