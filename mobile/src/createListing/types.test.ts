import { describe, expect, it } from 'vitest';
import { countListingPhotos, listingHasVideo, type ListingMediaItem } from './types';

function media(...kinds: Array<'photo' | 'video'>): ListingMediaItem[] {
  return kinds.map((kind, i) => ({ id: `m-${i}`, uri: `file://${i}.jpg`, kind }));
}

describe('countListingPhotos', () => {
  it('counts only photo items', () => {
    expect(countListingPhotos(media('photo', 'photo', 'video'))).toBe(2);
  });
});

describe('listingHasVideo', () => {
  it('regression: detects a video attachment so publish can warn instead of silently dropping it', () => {
    expect(listingHasVideo(media('photo', 'video'))).toBe(true);
  });

  it('returns false when no video is attached', () => {
    expect(listingHasVideo(media('photo', 'photo'))).toBe(false);
  });

  it('returns false for empty media', () => {
    expect(listingHasVideo([])).toBe(false);
  });
});
