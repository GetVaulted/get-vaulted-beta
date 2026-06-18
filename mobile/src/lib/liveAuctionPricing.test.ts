import { validateAuctionPricing, validateQuickLiveLot } from './liveAuctionPricing';

describe('validateAuctionPricing', () => {
  it('accepts quantity and starting bid', () => {
    const r = validateAuctionPricing({
      quantity: '3',
      startingBid: '5',
      reservePrice: '',
      buyNowPrice: '',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.quantity).toBe(3);
      expect(r.values.startingBidUsd).toBe(5);
    }
  });

  it('rejects quantity below 1', () => {
    const r = validateAuctionPricing({
      quantity: '0',
      startingBid: '5',
      reservePrice: '',
      buyNowPrice: '',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects reserve below start', () => {
    const r = validateAuctionPricing({
      quantity: '1',
      startingBid: '10',
      reservePrice: '5',
      buyNowPrice: '',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects buy now below reserve', () => {
    const r = validateAuctionPricing({
      quantity: '1',
      startingBid: '10',
      reservePrice: '50',
      buyNowPrice: '40',
    });
    expect(r.ok).toBe(false);
  });
});

describe('validateQuickLiveLot', () => {
  it('accepts auction with default quantity', () => {
    const r = validateQuickLiveLot({
      title: 'Rookie slab',
      saleType: 'auction',
      price: '5',
      quantity: '',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.quantity).toBe(1);
      expect(r.values.startingBidUsd).toBe(5);
      expect(r.values.saleType).toBe('auction');
    }
  });

  it('requires buy-it-now price', () => {
    const r = validateQuickLiveLot({
      title: 'Sneaker drop',
      saleType: 'buy_now',
      price: '',
      quantity: '2',
    });
    expect(r.ok).toBe(false);
  });
});
