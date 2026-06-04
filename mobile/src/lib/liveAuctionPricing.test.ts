import {
  defaultBidIncrementUsd,
  validateAuctionPricing,
} from './liveAuctionPricing';

describe('validateAuctionPricing', () => {
  it('accepts minimum starting bid and auto increment', () => {
    const r = validateAuctionPricing({
      startingBid: '5',
      bidIncrement: '',
      reservePrice: '',
      buyNowPrice: '',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.startingBidUsd).toBe(5);
      expect(r.values.bidIncrementUsd).toBeNull();
    }
  });

  it('rejects reserve below start', () => {
    const r = validateAuctionPricing({
      startingBid: '10',
      bidIncrement: '1',
      reservePrice: '5',
      buyNowPrice: '',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects buy now below reserve', () => {
    const r = validateAuctionPricing({
      startingBid: '10',
      bidIncrement: '2',
      reservePrice: '50',
      buyNowPrice: '40',
    });
    expect(r.ok).toBe(false);
  });
});

describe('defaultBidIncrementUsd', () => {
  it('scales with starting bid', () => {
    expect(defaultBidIncrementUsd(1)).toBe(1);
    expect(defaultBidIncrementUsd(100)).toBeGreaterThanOrEqual(4);
  });
});
