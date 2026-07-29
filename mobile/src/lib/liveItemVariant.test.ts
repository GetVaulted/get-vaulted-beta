import { describe, expect, it } from 'vitest';
import type { LiveRoomBuyerSnapshot } from '../api/liveRoomBuyerRepository';
import {
  availableVariantCount,
  evaluateFreshVariantsForBatchCheckout,
  evaluateFreshVariantsForCheckout,
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
    expect(isVariantSalesFormat('player_selection')).toBe(true);
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
    expect(variantSelectSpotLabel('player_selection')).toBe('Pick Your Player');
    expect(variantSelectSpotLabel('player_selection', true)).toBe('Random Player');
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

// Regression (2026-07 pick-mode overcharge gap): the pre-charge refresh must abort checkout for
// BOTH "the active lot changed" and "the refresh request failed" — collapsing these into one
// nullable case previously let checkout fall through and charge against stale local data.
describe('evaluateFreshVariantsForCheckout', () => {
  const availableVariant = {
    id: 'v1',
    label: 'Team A',
    priceUsd: 10,
    quantityRemaining: 1,
    soldCount: 0,
    isHot: false,
    sortOrder: 0,
    status: 'available',
    buyerUsername: null,
  };

  it('proceeds when the fresh snapshot confirms the selected spot is still available', () => {
    const decision = evaluateFreshVariantsForCheckout({ status: 'fresh', variants: [availableVariant] }, 'v1');
    expect(decision).toEqual({ proceed: true });
  });

  it('aborts and closes the sheet when the active lot changed underneath the buyer', () => {
    const decision = evaluateFreshVariantsForCheckout({ status: 'item_changed' }, 'v1');
    expect(decision.proceed).toBe(false);
    if (decision.proceed) throw new Error('unreachable');
    expect(decision.closeSheet).toBe(true);
    expect(decision.message).toMatch(/lot has changed/i);
  });

  it('aborts without closing the sheet when the refresh request itself failed (network error)', () => {
    const decision = evaluateFreshVariantsForCheckout({ status: 'fetch_failed' }, 'v1');
    expect(decision.proceed).toBe(false);
    if (decision.proceed) throw new Error('unreachable');
    expect(decision.closeSheet).toBe(false);
    expect(decision.message).toMatch(/couldn't verify availability/i);
  });

  it('aborts when the fresh snapshot shows the selected spot was just taken', () => {
    const decision = evaluateFreshVariantsForCheckout(
      { status: 'fresh', variants: [{ ...availableVariant, quantityRemaining: 0, status: 'sold_out' }] },
      'v1',
    );
    expect(decision.proceed).toBe(false);
    if (decision.proceed) throw new Error('unreachable');
    expect(decision.closeSheet).toBe(false);
  });

  it('aborts when the selected spot is no longer present in the fresh snapshot', () => {
    const decision = evaluateFreshVariantsForCheckout({ status: 'fresh', variants: [] }, 'v1');
    expect(decision.proceed).toBe(false);
  });

  it('proceeds on a local-trust basis when the item was never tracked as the active lot (pre-live shop flow)', () => {
    const decision = evaluateFreshVariantsForCheckout({ status: 'not_tracked' }, 'v1');
    expect(decision).toEqual({ proceed: true });
  });

  it('batch checkout requires every selected id to still be open', () => {
    const availableVariant = {
      id: 'v1',
      label: 'Bengals',
      priceUsd: 10,
      quantityRemaining: 1,
      soldCount: 0,
      isHot: false,
      sortOrder: 0,
      status: 'available',
      buyerUsername: null,
    };
    const ok = evaluateFreshVariantsForBatchCheckout(
      { status: 'fresh', variants: [availableVariant, { ...availableVariant, id: 'v2', label: 'Chiefs' }] },
      ['v1', 'v2'],
    );
    expect(ok).toEqual({ proceed: true });

    const missing = evaluateFreshVariantsForBatchCheckout(
      { status: 'fresh', variants: [availableVariant] },
      ['v1', 'v2'],
    );
    expect(missing.proceed).toBe(false);
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
