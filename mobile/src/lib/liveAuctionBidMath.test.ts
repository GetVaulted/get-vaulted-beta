import { describe, expect, it } from 'vitest';
import { liveAuctionMinBidUsd } from './liveAuctionBidMath';

describe('liveAuctionMinBidUsd', () => {
  it('first bid equals $1 opening when no high bidder', () => {
    expect(
      liveAuctionMinBidUsd({
        startingBidUsd: 1,
        currentBidUsd: 1,
        lastHighBidderId: null,
      }),
    ).toBe(1);
  });

  it('second bid increments after leader is set', () => {
    expect(
      liveAuctionMinBidUsd({
        startingBidUsd: 1,
        currentBidUsd: 1,
        lastHighBidderId: 'user-1',
      }),
    ).toBe(2);
  });
});
