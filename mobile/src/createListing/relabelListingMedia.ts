import type { ListingMediaItem } from './types';

/** Keeps hero / photo numbering in sync after reorder or removal. */
export function relabelListingMedia(media: ListingMediaItem[]): ListingMediaItem[] {
  let photoIndex = 0;
  return media.map((m) => {
    if (m.kind === 'video') {
      return { ...m, label: 'Video' };
    }
    photoIndex += 1;
    return {
      ...m,
      label: photoIndex === 1 ? 'Hero photo' : `Photo ${photoIndex}`,
    };
  });
}
