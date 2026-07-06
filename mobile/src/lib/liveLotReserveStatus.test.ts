import { describe, expect, it } from 'vitest';
import { computeLiveLotReserveMet } from './liveLotReserveStatus';

// Legal/compliance audit (2026-07): the host's pinned-lot card previously showed "Reserve met" as
// soon as the current bid reached the lot's starting/listed price (priceUsd), not its actual
// reserve price — so reserve status was effectively always wrong. This locks in the fix.
describe('computeLiveLotReserveMet', () => {
  it('returns null when the lot has no reserve price set', () => {
    expect(computeLiveLotReserveMet({ reservePriceUsd: null, currentBidUsd: 500 })).toBeNull();
  });

  it('returns null when there is no bid yet', () => {
    expect(computeLiveLotReserveMet({ reservePriceUsd: 200, currentBidUsd: null })).toBeNull();
  });

  it('returns false when the current bid is below the reserve price', () => {
    expect(computeLiveLotReserveMet({ reservePriceUsd: 200, currentBidUsd: 150 })).toBe(false);
  });

  it('returns true when the current bid meets or exceeds the reserve price', () => {
    expect(computeLiveLotReserveMet({ reservePriceUsd: 200, currentBidUsd: 200 })).toBe(true);
    expect(computeLiveLotReserveMet({ reservePriceUsd: 200, currentBidUsd: 250 })).toBe(true);
  });

  it('is not fooled by a low starting price once a reserve is configured', () => {
    expect(computeLiveLotReserveMet({ reservePriceUsd: 500, currentBidUsd: 50 })).toBe(false);
  });
});
