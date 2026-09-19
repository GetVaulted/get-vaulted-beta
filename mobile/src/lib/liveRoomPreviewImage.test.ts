import { describe, expect, it, vi } from 'vitest';
import { resolveLiveRoomPreviewImage, resolveLiveRoomMediaUrl } from './liveRoomPreviewImage';

vi.mock('./webApiBaseUrl', () => ({
  getWebApiBaseUrl: () => 'https://beta.shopgetvaulted.com',
}));

describe('liveRoomPreviewImage', () => {
  it('resolves relative upload paths against the API host', () => {
    expect(resolveLiveRoomMediaUrl('/uploads/listings/abc.jpg')).toBe(
      'https://beta.shopgetvaulted.com/uploads/listings/abc.jpg',
    );
  });

  it('prefers uploaded thumbnail over listing image', () => {
    const url = resolveLiveRoomPreviewImage({
      thumbnailUrl: '/uploads/listings/thumb.jpg',
      firstItemImageUrl: '/uploads/listings/item.jpg',
      category: 'cards',
    });
    expect(url).toBe('https://beta.shopgetvaulted.com/uploads/listings/thumb.jpg');
  });

  it('falls back to first item image when thumbnail missing', () => {
    const url = resolveLiveRoomPreviewImage({
      thumbnailUrl: '',
      firstItemImageUrl: 'https://cdn.example/item.jpg',
      category: 'cards',
    });
    expect(url).toBe('https://cdn.example/item.jpg');
  });

  it('uses host avatar before category art when no images exist', () => {
    const url = resolveLiveRoomPreviewImage({
      thumbnailUrl: '',
      firstItemImageUrl: '',
      sellerAvatarUrl: 'https://cdn.example/avatar.jpg',
      category: 'sneakers',
    });
    expect(url).toBe('https://cdn.example/avatar.jpg');
  });

  it('uses category art when no images or avatar exist', () => {
    const url = resolveLiveRoomPreviewImage({
      thumbnailUrl: '',
      firstItemImageUrl: '',
      category: 'sneakers',
    });
    expect(url).toContain('unsplash.com');
  });
});
