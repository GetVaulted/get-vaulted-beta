import { describe, expect, it } from 'vitest';
import { sellerPreviewMirror, SELLER_DEFAULT_CAMERA_FACING } from './sellerHostCamera';

describe('sellerHostCamera', () => {
  it('defaults to rear camera facing', () => {
    expect(SELLER_DEFAULT_CAMERA_FACING).toBe('back');
  });

  it('mirrors front camera preview only', () => {
    expect(sellerPreviewMirror('front')).toBe(true);
    expect(sellerPreviewMirror('back')).toBe(false);
  });

  it('lets a seller override the front-camera mirror', () => {
    expect(sellerPreviewMirror('front', false)).toBe(false);
    expect(sellerPreviewMirror('front', true)).toBe(true);
    expect(sellerPreviewMirror('front', null)).toBe(true);
  });

  it('never force-mirrors the rear camera, even with an override set', () => {
    expect(sellerPreviewMirror('back', false)).toBe(false);
    expect(sellerPreviewMirror('back', true)).toBe(false);
  });
});
