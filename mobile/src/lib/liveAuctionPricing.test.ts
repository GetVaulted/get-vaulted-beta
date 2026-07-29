import { syncPickBreakSpotDrafts, validateAuctionPricing, validateQuickLiveLot } from './liveAuctionPricing';
import { buildPytVariants } from './liveBreakPresets';

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
  it('accepts auction with reserve and buy-it-now', () => {
    const r = validateQuickLiveLot({
      title: 'Rookie slab',
      saleType: 'auction',
      price: '5',
      quantity: '2',
      reservePrice: '20',
      buyNowPrice: '50',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.reservePriceUsd).toBe(20);
      expect(r.values.priceUsd).toBe(50);
    }
  });

  it('accepts auction with default quantity', () => {
    const r = validateQuickLiveLot({
      title: 'Rookie slab',
      saleType: 'auction',
      price: '5',
      quantity: '',
      reservePrice: '',
      buyNowPrice: '',
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
      reservePrice: '',
      buyNowPrice: '',
    });
    expect(r.ok).toBe(false);
  });

  it('builds PYT variants for all 32 teams', () => {
    const r = validateQuickLiveLot({
      title: '2024 Prizm Hobby',
      saleType: 'pyt',
      price: '35',
      quantity: '1',
      reservePrice: '',
      buyNowPrice: '',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.salesFormat).toBe('variant_selection');
      expect(r.values.variants?.length).toBe(32);
      expect(r.values.variants?.[0]?.color).toBe('ARI');
    }
  });

  it('builds PYD variants for all 8 divisions', () => {
    const r = validateQuickLiveLot({
      title: 'Division break',
      saleType: 'pyd',
      price: '120',
      quantity: '1',
      reservePrice: '',
      buyNowPrice: '',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.salesFormat).toBe('team_break');
      expect(r.values.variants?.length).toBe(8);
      expect(r.values.variants?.[0]?.label).toBe('AFC East');
    }
  });

  it('appends buyable NCAA spot on NFL PYT when enabled', () => {
    const r = validateQuickLiveLot({
      title: 'NFL PYT with NCAA',
      saleType: 'pyt',
      price: '40',
      quantity: '1',
      reservePrice: '',
      buyNowPrice: '',
      boardPack: 'nfl',
      includeNcaaSpot: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.variants?.length).toBe(33);
      expect(r.values.teamBoardNcaa).toBe(true);
      expect(r.values.variants?.some((v) => v.color === 'NCAA' && v.label === 'NCAA')).toBe(true);
    }
  });

  it('bumps random NFL pool when NCAA is enabled', () => {
    const r = validateQuickLiveLot({
      title: 'Random NFL with NCAA',
      saleType: 'random_pyt',
      price: '25',
      quantity: '1',
      reservePrice: '',
      buyNowPrice: '',
      boardPack: 'nfl',
      includeNcaaSpot: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.teamBoardNcaa).toBe(true);
      expect(r.values.variants?.[0]?.quantityInitial).toBe(33);
    }
  });
});

describe('syncPickBreakSpotDrafts', () => {
  it('updates all team prices when price per team changes before manual edits', () => {
    const initial = buildPytVariants(3);
    const synced = syncPickBreakSpotDrafts({
      prev: initial,
      saleType: 'pyt',
      basePrice: 30,
      spotsCustomized: false,
    });
    expect(synced).toHaveLength(32);
    expect(synced.every((spot) => spot.priceUsd === 30)).toBe(true);
  });

  it('keeps manual spot prices after customization', () => {
    const initial = buildPytVariants(30);
    const customized = initial.map((spot, index) =>
      index === 0 ? { ...spot, priceUsd: 45 } : spot,
    );
    const synced = syncPickBreakSpotDrafts({
      prev: customized,
      saleType: 'pyt',
      basePrice: 35,
      spotsCustomized: true,
    });
    expect(synced[0]?.priceUsd).toBe(45);
    expect(synced[1]?.priceUsd).toBe(30);
  });

  it("adds NCAA spot when includeNcaaSpot is set", () => {
    const synced = syncPickBreakSpotDrafts({
      prev: [],
      saleType: 'pyt',
      basePrice: 20,
      spotsCustomized: false,
      boardPack: 'nfl',
      includeNcaaSpot: true,
    });
    expect(synced).toHaveLength(33);
    expect(synced[32]?.color).toBe('NCAA');
  });
});

describe('validateQuickLiveLot PYP', () => {
  it('builds pick-your-player variants from a pasted list', () => {
    const r = validateQuickLiveLot({
      title: 'Rookie checklist',
      saleType: 'pyp',
      price: '15',
      quantity: '1',
      reservePrice: '',
      buyNowPrice: '',
      playerListText: 'Mahomes\nAllen\nHurts',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.salesFormat).toBe('player_selection');
      expect(r.values.variantAssignmentMode).toBe('pick');
      expect(r.values.variants?.length).toBe(3);
      expect(r.values.variants?.[0]?.label).toBe('Mahomes');
    }
  });

  it('builds random player pool from a pasted list', () => {
    const r = validateQuickLiveLot({
      title: 'Random rookies',
      saleType: 'random_pyp',
      price: '10',
      quantity: '1',
      reservePrice: '',
      buyNowPrice: '',
      playerListText: 'A\nB\nC\nD',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.salesFormat).toBe('player_selection');
      expect(r.values.variantAssignmentMode).toBe('random');
      expect(r.values.customRandomPoolLabels).toEqual(['A', 'B', 'C', 'D']);
      expect(r.values.variants?.[0]?.quantityInitial).toBe(4);
    }
  });
});
