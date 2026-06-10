import { describe, expect, it } from 'vitest';
import { LISTING_MAX_PHOTOS } from '../createListing/types';
import { mapStoredListingToProduct } from './mapStoredListingToProduct';
import type { WebStoredListing } from './webListingsRepository';

describe('mapStoredListingToProduct imageDataUrls', () => {
  it('maps all 10 stored image URLs without truncation', () => {
    const imageDataUrls = Array.from(
      { length: LISTING_MAX_PHOTOS },
      (_, i) => `https://cdn.example.com/stored/photo-${i + 1}.jpg`,
    );

    const product = mapStoredListingToProduct({
      id: 'stored-10',
      sellerId: 'seller-1',
      title: 'Stored listing',
      imageDataUrls,
      price: 250,
      buyingFormat: 'buy_now',
    } as WebStoredListing);

    expect(product.imageUrls).toHaveLength(LISTING_MAX_PHOTOS);
    expect(product.imageUrls).toEqual(imageDataUrls);
    expect(product.imageUrl).toBe(imageDataUrls[0]);
  });
});
