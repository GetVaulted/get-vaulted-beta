import { describe, expect, it } from 'vitest';
import { avatarUrlWithCacheBust, computeAvatarCropRect } from './profileAvatarCropMath';

describe('profileAvatarCropMath', () => {
  it('adds cache bust query param', () => {
    expect(avatarUrlWithCacheBust('https://cdn.example.com/a.jpg', 123)).toBe(
      'https://cdn.example.com/a.jpg?v=123',
    );
  });

  it('computes centered square crop for cover-fit image', () => {
    const crop = computeAvatarCropRect({
      imageWidth: 1200,
      imageHeight: 800,
      viewportSize: 280,
      userScale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    expect(crop.width).toBe(crop.height);
    expect(crop.originX).toBeGreaterThanOrEqual(0);
    expect(crop.originY).toBeGreaterThanOrEqual(0);
  });
});
