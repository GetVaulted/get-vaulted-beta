import { describe, expect, it } from 'vitest';
import type { LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';
import {
  availableVariantCount,
  isActiveVariantBuyerItem,
  isVariantSalesFormat,
  sortVariantsForBuyerDisplay,
  summarizeVariantSpots,
  variantSelectSpotLabel,
} from './liveItemVariant';
import { resolvePinnedLotOverlayPrice } from './liveAuctionOverlayPrice';

describe('isVariantSalesFormat', () => {
  it('matches team break formats', () => {
    expect(isVariantSalesFormat('team_break')).toBe(true);
    expect(isVariantSalesFormat('variant_selection')).toBe(true);
    expect(isVariantSalesFormat('auction')).toBe(false);
  });
});

describe('isActiveVariantBuyerItem', () => {
  it('true when live item has variants', () => {
    const snap = {
      status: 'live',
      activeItemId: 'item-1',
      activeItemSalesFormat: 'team_break',
      activeItemVariants: [{ id: 'v1', label: 'AFC East', priceUsd: 35, quantityRemaining: 1, soldCount: 0, isHot: false, sortOrder: 0, status: 'available', buyerUsername: null }],
    } as LiveRoomBuyerSnapshot;
    expect(isActiveVariantBuyerItem(snap)).toBe(true);
  });

  it('false for regular auction item', () => {
    const snap = {
      status: 'live',
      activeItemId: 'item-1',
      activeItemSalesFormat: 'auction',
    } as LiveRoomBuyerSnapshot;
    expect(isActiveVariantBuyerItem(snap)).toBe(false);
  });
});

describe('availableVariantCount', () => {
  it('ignores sold out variants', () => {
    expect(
      availableVariantCount([
        { id: '1', label: 'A', priceUsd: 1, quantityRemaining: 0, soldCount: 1, isHot: false, sortOrder: 0, status: 'sold_out', buyerUsername: 'buyer' },
        { id: '2', label: 'B', priceUsd: 1, quantityRemaining: 2, soldCount: 0, isHot: false, sortOrder: 1, status: 'available', buyerUsername: null },
      ]),
    ).toBe(1);
  });
});

describe('sortVariantsForBuyerDisplay', () => {
  it('puts supplementals before NFL divisions', () => {
    const sorted = sortVariantsForBuyerDisplay([
      { id: 'd1', label: 'AFC East', sortOrder: 0 },
      { id: 's2', label: 'Break #3 Suppy #2', sortOrder: 9 },
      { id: 'd8', label: 'NFC West', sortOrder: 7 },
      { id: 's1', label: 'Break #3 Suppy #1', sortOrder: 8 },
    ]);
    expect(sorted.map((v) => v.id)).toEqual(['s1', 's2', 'd1', 'd8']);
  });
});

describe('variantSelectSpotLabel', () => {
  it('uses team label for team_break', () => {
    expect(variantSelectSpotLabel('team_break')).toBe('Pick Your Division');
    expect(variantSelectSpotLabel('variant_selection')).toBe('Pick Your Team');
  });
});

describe('summarizeVariantSpots', () => {
  it('returns lowest open spot price', () => {
    const stats = summarizeVariantSpots([
      { priceUsd: 35, quantityRemaining: 1, status: 'available' },
      { priceUsd: 50, quantityRemaining: 0, status: 'sold_out', soldCount: 1 },
    ]);
    expect(stats.fromPriceUsd).toBe(35);
    expect(stats.available).toBe(1);
  });
});

describe('resolvePinnedLotOverlayPrice', () => {
  it('shows From for PYT spot boards', () => {
    expect(
      resolvePinnedLotOverlayPrice({
        salesFormat: 'variant_selection',
        variants: [{ priceUsd: 35, quantityRemaining: 32, status: 'available' }],
      }),
    ).toMatchObject({ label: 'From', amountUsd: 35 });
  });
});
