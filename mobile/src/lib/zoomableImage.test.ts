import { describe, expect, it } from 'vitest';
import {
  ZOOMABLE_IMAGE_DOUBLE_TAP_SCALE,
  ZOOMABLE_IMAGE_MAX_SCALE,
  ZOOMABLE_IMAGE_MIN_SCALE,
  clampScale,
  clampTranslation,
  nextDoubleTapScale,
} from './zoomableImage';

describe('clampScale', () => {
  it('passes through values within range', () => {
    expect(clampScale(2.3)).toBe(2.3);
  });

  it('clamps below the minimum', () => {
    expect(clampScale(0.4)).toBe(ZOOMABLE_IMAGE_MIN_SCALE);
  });

  it('clamps above the maximum', () => {
    expect(clampScale(9)).toBe(ZOOMABLE_IMAGE_MAX_SCALE);
  });

  it('respects custom bounds', () => {
    expect(clampScale(10, 1, 3)).toBe(3);
    expect(clampScale(-5, 1, 3)).toBe(1);
  });

  it('falls back to the minimum for non-finite input', () => {
    expect(clampScale(NaN)).toBe(ZOOMABLE_IMAGE_MIN_SCALE);
    expect(clampScale(Infinity)).toBe(ZOOMABLE_IMAGE_MIN_SCALE);
  });
});

describe('clampTranslation', () => {
  it('allows no translation at rest scale (1x)', () => {
    expect(clampTranslation(50, 1, 400)).toBe(0);
  });

  it('allows translation up to the scaled overflow', () => {
    // containerSize 400, scale 2 -> overflow is (400 * (2-1)) / 2 = 200
    expect(clampTranslation(120, 2, 400)).toBe(120);
    expect(clampTranslation(500, 2, 400)).toBe(200);
    expect(clampTranslation(-500, 2, 400)).toBe(-200);
  });

  it('scales the allowed range with zoom level', () => {
    expect(clampTranslation(300, 3, 400)).toBe(300);
    expect(clampTranslation(300, 1.5, 400)).toBe(100);
  });

  it('returns 0 for non-finite input', () => {
    expect(clampTranslation(NaN, 2, 400)).toBe(0);
  });

  it('returns 0 when container size is 0 or negative', () => {
    expect(clampTranslation(50, 2, 0)).toBe(0);
    expect(clampTranslation(50, 2, -100)).toBe(0);
  });
});

describe('nextDoubleTapScale', () => {
  it('zooms in from the rest scale', () => {
    expect(nextDoubleTapScale(1)).toBe(ZOOMABLE_IMAGE_DOUBLE_TAP_SCALE);
  });

  it('resets to rest when already zoomed in', () => {
    expect(nextDoubleTapScale(2.5)).toBe(ZOOMABLE_IMAGE_MIN_SCALE);
    expect(nextDoubleTapScale(4)).toBe(ZOOMABLE_IMAGE_MIN_SCALE);
  });

  it('treats near-rest scale (pinch settled slightly above 1) as still at rest', () => {
    expect(nextDoubleTapScale(1.005)).toBe(ZOOMABLE_IMAGE_DOUBLE_TAP_SCALE);
  });

  it('respects custom zoomed/rest scale arguments', () => {
    expect(nextDoubleTapScale(1, 3, 1)).toBe(3);
    expect(nextDoubleTapScale(3, 3, 1)).toBe(1);
  });
});
