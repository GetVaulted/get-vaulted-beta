import { describe, expect, it } from 'vitest';
import {
  isSweet16DraftMode,
  sweet16SalesProgress,
  sweet16SoldCount,
  sweet16TileState,
} from './liveSweet16Sales';

const open = { quantityRemaining: 1, status: 'available' };
const sold = { quantityRemaining: 0, status: 'sold_out' };

function board(soldCount: number, total = 32) {
  return Array.from({ length: total }, (_, i) => (i < soldCount ? sold : open));
}

describe('sweet16 sales progress', () => {
  it('recognizes draft mode only', () => {
    expect(isSweet16DraftMode('draft')).toBe(true);
    expect(isSweet16DraftMode('pick')).toBe(false);
    expect(isSweet16DraftMode(null)).toBe(false);
  });

  it('counts sold teams and ignores removed ones', () => {
    expect(sweet16SoldCount([...board(3), { quantityRemaining: 0, status: 'removed' }])).toBe(3);
    expect(sweet16SoldCount(undefined)).toBe(0);
  });

  it('shows "N of 16 sold" (not of 32) while sales are open', () => {
    const p = sweet16SalesProgress({ variants: board(5) });
    expect(p).toMatchObject({ sold: 5, max: 16, closed: false, statusLabel: '5 of 16 sold' });
  });

  it('closes at 16 sold even before the server flag arrives', () => {
    const p = sweet16SalesProgress({ variants: board(16) });
    expect(p.closed).toBe(true);
    expect(p.statusLabel).toBe('Sales closed — 16 teams sold');
  });

  it('closes when the server sets variantBreakReadyAt', () => {
    const p = sweet16SalesProgress({ variants: board(15), breakReadyAt: '2026-10-06T00:00:00.000Z' });
    expect(p.closed).toBe(true);
  });

  it('never reports more than 16 sold', () => {
    expect(sweet16SalesProgress({ variants: board(20) }).sold).toBe(16);
  });
});

describe('sweet16TileState', () => {
  it('is buyable only while sales are open and the team is unsold', () => {
    expect(sweet16TileState(open, false)).toBe('open');
    expect(sweet16TileState(open, true)).toBe('closed');
    expect(sweet16TileState(sold, true)).toBe('sold');
    expect(sweet16TileState({ quantityRemaining: 1, status: 'removed' }, false)).toBe('unavailable');
  });
});
