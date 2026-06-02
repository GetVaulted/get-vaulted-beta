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
});
