import { describe, expect, it } from 'vitest';
import { mapStoredListingToProduct } from '../api/mapStoredListingToProduct';
import { mapWebMarketplaceListingToProduct } from '../api/mapWebMarketplaceListing';
import type { WebMarketplaceListing } from '../api/webListingsTypes';
import type { WebStoredListing } from '../api/webListingsRepository';
import { enrichListing } from '../data/productListingEnrichment';
import { LISTING_MAX_PHOTOS } from '../createListing/types';
import {
  buildListingGallerySlides,
  collectListingImageUrls,
  LISTING_GALLERY_PHOTO_LIMIT,
} from './productListingGallery';

function tenUniqueUrls(prefix: string): string[] {
  return Array.from({ length: LISTING_MAX_PHOTOS }, (_, i) => `https://cdn.example.com/${prefix}/${i + 1}.jpg`);
}

describe('listing photo pipeline (upload limit → API → mobile → gallery)', () => {
  it('documents gallery photo limit aligned with create-listing cap', () => {
    expect(LISTING_GALLERY_PHOTO_LIMIT).toBe(10);
    expect(LISTING_MAX_PHOTOS).toBe(10);
  });

  it('web marketplace mapping → enrichment → 10 gallery slides in order', () => {
    const apiUrls = tenUniqueUrls('api');
    const listing: WebMarketplaceListing = {
      id: 'l-10',
      title: 'Full gallery',
      price: 1000,
      imageSeed: 'x',
      imageUrls: apiUrls,
      sellerUsername: 'seller',
      sellerVerified: false,
      category: 'Trading Cards',
      buyingFormat: 'buy_now',
      condition: 'Mint',
      listedAt: new Date().toISOString(),
      href: '/listing/l-10',
    };

    const product = mapWebMarketplaceListingToProduct(listing);
    expect(collectListingImageUrls(product)).toEqual(apiUrls);

    const vm = enrichListing(product);
    expect(vm.gallery).toHaveLength(LISTING_MAX_PHOTOS);
    expect(vm.gallery.map((s) => s.uri)).toEqual(apiUrls);
    expect(vm.gallery.map((s) => s.id)).toEqual(
      Array.from({ length: LISTING_MAX_PHOTOS }, (_, i) => `photo-${i}`),
    );
  });

  it('stored listing mapping → 10 gallery slides (owner/detail fallback path)', () => {
    const storedUrls = tenUniqueUrls('stored');
    const row = {
      id: 's-10',
      sellerId: 'u1',
      title: 'Stored',
      imageDataUrls: storedUrls,
      price: 400,
      buyingFormat: 'buy_now',
    } as WebStoredListing;

    const product = mapStoredListingToProduct(row);
    const slides = buildListingGallerySlides(product);
    expect(slides).toHaveLength(LISTING_MAX_PHOTOS);
    expect(slides.map((s) => s.uri)).toEqual(storedUrls);
  });

  it('dedupes exact URL duplicates only — does not drop distinct photos', () => {
    const urls = tenUniqueUrls('distinct');
    const withDup = [...urls.slice(0, 5), urls[2]!, ...urls.slice(5)];
    expect(withDup).toHaveLength(11);

    const slides = buildListingGallerySlides({
      id: 'dup',
      title: 'Dup test',
      category: 'cards',
      imageGradient: ['#000', '#111'],
      vaultVerified: false,
      listingPrice: '$1',
      imageUrls: withDup,
      seller: {
        id: 's',
        name: 'n',
        handle: '@n',
        avatarUrl: '',
        verified: false,
        followers: '—',
      },
    });

    expect(slides).toHaveLength(LISTING_MAX_PHOTOS);
    expect(slides.map((s) => s.uri)).toEqual(urls);
  });
});
