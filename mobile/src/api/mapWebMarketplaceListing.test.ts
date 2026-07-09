import { describe, expect, it } from 'vitest';
import { mapWebMarketplaceListingToProduct } from './mapWebMarketplaceListing';
import type { WebMarketplaceListing } from './webListingsTypes';

describe('mapWebMarketplaceListingToProduct', () => {
  it('maps trade-only listings to trade badge fields', () => {
    const listing: WebMarketplaceListing = {
      id: 'l1',
      title: 'PSA 10 Charizard',
      price: 1,
      imageSeed: 'seed',
      sellerUsername: 'seller',
      sellerVerified: true,
      category: 'Trading Cards',
      buyingFormat: 'buy_now',
      condition: 'Graded',
      listedAt: new Date().toISOString(),
      href: '/listing/l1',
      acceptTradeOffers: true,
      allowOffers: false,
      allowLayaway: false,
    };
    const product = mapWebMarketplaceListingToProduct(listing);
    expect(product.tradeOnly).toBe(true);
    expect(product.listingPrice).toBe('Trade offers');
    expect(product.buyNow).toBeUndefined();
  });
});
