import { describe, expect, it } from 'vitest';
import type { LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';
import {
  availableVariantCount,
  isActiveVariantBuyerItem,
  isVariantSalesFormat,
  variantSelectSpotLabel,
} from './liveItemVariant';

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
      activeItemVariants: [{ id: 'v1', label: 'AFC East', priceUsd: 35, quantityRemaining: 1, soldCount: 0, isHot: false, status: 'available', buyerUsername: null }],
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
        { id: '1', label: 'A', priceUsd: 1, quantityRemaining: 0, soldCount: 1, isHot: false, status: 'sold_out', buyerUsername: 'buyer' },
        { id: '2', label: 'B', priceUsd: 1, quantityRemaining: 2, soldCount: 0, isHot: false, status: 'available', buyerUsername: null },
      ]),
    ).toBe(1);
  });
});

describe('variantSelectSpotLabel', () => {
  it('uses team label for team_break', () => {
    expect(variantSelectSpotLabel('team_break')).toBe('Select Team');
    expect(variantSelectSpotLabel('variant_selection')).toBe('Select Spot');
  });
});
