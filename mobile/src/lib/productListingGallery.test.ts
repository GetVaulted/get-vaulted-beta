import { describe, expect, it } from 'vitest';
import { LISTING_MAX_PHOTOS } from '../createListing/types';
import {
  buildListingGallerySlides,
  collectListingImageUrls,
  dedupeImageUrls,
  LISTING_GALLERY_PHOTO_LIMIT,
} from './productListingGallery';
import type { Product } from '../types';

const baseProduct = (): Product => ({
  id: 'l1',
  title: 'Test listing',
  category: 'cards',
  imageGradient: ['#000', '#111'],
  vaultVerified: false,
  listingPrice: '$100',
  seller: {
    id: 's1',
    name: 'seller',
    handle: '@seller',
    avatarUrl: '',
    verified: false,
    followers: '—',
  },
});

describe('dedupeImageUrls', () => {
  it('removes exact duplicate URLs only', () => {
    expect(dedupeImageUrls(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('preserves distinct photo URLs', () => {
    const urls = [
      'https://cdn.example.com/photo-1.jpg',
      'https://cdn.example.com/photo-2.jpg',
      'https://cdn.example.com/photo-3.jpg',
    ];
    expect(dedupeImageUrls(urls)).toEqual(urls);
  });
});

describe('collectListingImageUrls', () => {
  it('prefers imageUrls array over single imageUrl', () => {
    const urls = collectListingImageUrls({
      imageUrls: ['https://a/1.jpg', 'https://a/2.jpg'],
      imageUrl: 'https://a/0.jpg',
    });
    expect(urls).toEqual(['https://a/1.jpg', 'https://a/2.jpg']);
  });

  it('falls back to imageUrl when array is empty', () => {
    expect(
      collectListingImageUrls({
        imageUrl: 'https://a/hero.jpg',
      }),
    ).toEqual(['https://a/hero.jpg']);
  });
});

describe('buildListingGallerySlides', () => {
  it('creates one slide per unique uploaded photo', () => {
    const product: Product = {
      ...baseProduct(),
      imageUrls: [
        'https://cdn.example.com/front.jpg',
        'https://cdn.example.com/back.jpg',
        'https://cdn.example.com/tag.jpg',
      ],
      imageUrl: 'https://cdn.example.com/front.jpg',
    };
    const slides = buildListingGallerySlides(product);
    expect(slides).toHaveLength(3);
    expect(slides.map((s) => s.uri)).toEqual([
      'https://cdn.example.com/front.jpg',
      'https://cdn.example.com/back.jpg',
      'https://cdn.example.com/tag.jpg',
    ]);
    expect(slides[0]?.kind).toBe('hero');
  });

  it('does not synthesize duplicate slides from one image', () => {
    const product: Product = {
      ...baseProduct(),
      imageUrl: 'https://cdn.example.com/only.jpg',
    };
    const slides = buildListingGallerySlides(product);
    expect(slides).toHaveLength(1);
    expect(slides[0]?.uri).toBe('https://cdn.example.com/only.jpg');
  });

  it('uses fallback when no photos exist', () => {
    const slides = buildListingGallerySlides(baseProduct());
    expect(slides).toHaveLength(1);
    expect(slides[0]?.id).toBe('fallback');
  });

  it('creates 10 slides for 10 unique uploaded photos (full Get Vaulted limit)', () => {
    const urls = Array.from(
      { length: LISTING_MAX_PHOTOS },
      (_, i) => `https://cdn.example.com/vault/photo-${i + 1}.jpg`,
    );
    const product: Product = {
      ...baseProduct(),
      imageUrls: urls,
      imageUrl: urls[0],
    };

    const slides = buildListingGallerySlides(product);
    expect(LISTING_GALLERY_PHOTO_LIMIT).toBe(10);
    expect(slides).toHaveLength(LISTING_MAX_PHOTOS);
    expect(slides.map((s) => s.uri)).toEqual(urls);
    expect(slides[0]?.caption).toBe('Featured');
    expect(slides[9]?.caption).toBe('Photo 10');
  });

  it('preserves upload order for swipe and thumbnail indices', () => {
    const urls = Array.from({ length: LISTING_MAX_PHOTOS }, (_, i) => `https://cdn.example.com/order/${i}.jpg`);
    const collected = collectListingImageUrls({ imageUrls: urls });
    expect(collected).toEqual(urls);
  });
});
