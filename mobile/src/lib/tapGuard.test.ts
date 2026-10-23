import { describe, expect, it } from 'vitest';
import { isTap, TAP_MAX_MOVE_PX } from './tapGuard';

describe('isTap', () => {
  it('treats a still finger as a tap', () => {
    expect(isTap(100, 200, 100, 200)).toBe(true);
    expect(isTap(100, 200, 103, 204)).toBe(true);
  });

  it('treats a drag past the limit as not a tap', () => {
    expect(isTap(100, 200, 100, 200 + TAP_MAX_MOVE_PX + 1)).toBe(false);
    expect(isTap(100, 200, 130, 200)).toBe(false);
  });

  it('counts missing coordinates as a tap so presses are never lost', () => {
    expect(isTap(undefined, 200, 100, 200)).toBe(true);
    expect(isTap(100, 200, Number.NaN, 200)).toBe(true);
  });
});
