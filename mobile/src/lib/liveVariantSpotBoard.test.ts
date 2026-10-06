import { describe, expect, it } from 'vitest';
import { spotAccentColor, segmentColorForLabel } from './liveBreakPresets';
import {
  buildVariantSpotDisplayRows,
  mergeRandomSpotClaimIntoItem,
  summarizeVariantSpotBoard,
} from './liveVariantSpotBoard';
import type { LiveRoomItemRow } from '../api/liveRoomControlRepository';

function makeItemRow(overrides: Partial<LiveRoomItemRow> = {}): LiveRoomItemRow {
  return {
    id: 'item-1',
    title: 'Test item',
    status: 'active',
    currentBidUsd: null,
    startingBidUsd: null,
    priceUsd: null,
    biddingOpen: false,
    auctionEndsAt: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe('buildVariantSpotDisplayRows random pool', () => {
  it('assigns per-team colors for random PYT boards', () => {
    const rows = buildVariantSpotDisplayRows({
      salesFormat: 'variant_selection',
      variantAssignmentMode: 'random',
      variants: [
        {
          id: 'pool',
          label: 'Random NFL Team',
          priceUsd: 25,
          quantityRemaining: 30,
          status: 'available',
          sortOrder: 0,
          color: 'nfl_teams',
          isHot: false,
          buyerUsername: null,
        },
      ],
      randomSpotClaims: [{ label: 'Chiefs', buyerUsername: 'buyer1' }],
    });

    const chiefs = rows.find((r) => r.label === 'Chiefs');
    const bills = rows.find((r) => r.label === 'Bills');
    expect(chiefs?.sold).toBe(true);
    expect(chiefs?.color).toBe('KC');
    expect(bills?.color).toBe('BUF');
    expect(spotAccentColor('Chiefs', chiefs?.color, false)).toBe('#E31837');
    expect(spotAccentColor('Bills', bills?.color, false)).toBe('#00338D');
  });

  it('keeps division board colors for random PYD', () => {
    const rows = buildVariantSpotDisplayRows({
      salesFormat: 'team_break',
      variantAssignmentMode: 'random',
      variants: [
        {
          id: 'pool',
          label: 'Random NFL Division',
          priceUsd: 40,
          quantityRemaining: 7,
          status: 'available',
          sortOrder: 0,
          color: 'nfl_divisions',
          isHot: false,
          buyerUsername: null,
        },
      ],
    });

    const afcEast = rows.find((r) => r.label === 'AFC East');
    expect(afcEast?.color).toBe('AFC');
    expect(spotAccentColor('AFC East', afcEast?.color, true)).toBe('#C83803');
    expect(segmentColorForLabel('AFC E', 'AFC E')).toBe('#C83803');
  });
});

describe('buildVariantSpotDisplayRows pick mode', () => {
  it('marks sold, open, hot, and pinned states from per-variant fields', () => {
    const rows = buildVariantSpotDisplayRows({
      salesFormat: 'variant_selection',
      variantAssignmentMode: 'pick',
      variants: [
        {
          id: 'v-open',
          label: 'Bengals',
          priceUsd: 20,
          quantityRemaining: 3,
          status: 'available',
          sortOrder: 0,
          isHot: false,
          buyerUsername: null,
        },
        {
          id: 'v-hot',
          label: 'Chiefs',
          priceUsd: 30,
          quantityRemaining: 1,
          status: 'available',
          sortOrder: 1,
          isHot: true,
          buyerUsername: null,
        },
        {
          id: 'v-sold',
          label: 'Bills',
          priceUsd: 25,
          quantityRemaining: 0,
          status: 'available',
          sortOrder: 2,
          isHot: false,
          buyerUsername: '@buyer2',
        },
      ],
    });

    const open = rows.find((r) => r.id === 'v-open');
    const hot = rows.find((r) => r.id === 'v-hot');
    const sold = rows.find((r) => r.id === 'v-sold');

    expect(open?.sold).toBe(false);
    expect(open?.buyerUsername).toBeNull();
    expect(hot?.isHot).toBe(true);
    expect(hot?.sold).toBe(false);
    expect(sold?.sold).toBe(true);
    expect(sold?.buyerUsername).toBe('buyer2');
  });

  it('treats a spot as sold when quantityRemaining is <= 0 even if status disagrees', () => {
    const rows = buildVariantSpotDisplayRows({
      salesFormat: 'variant_selection',
      variantAssignmentMode: 'pick',
      variants: [
        {
          id: 'v-taken',
          label: 'Ravens',
          priceUsd: 20,
          quantityRemaining: 0,
          status: 'available',
          sortOrder: 0,
          isHot: false,
          buyerUsername: '@ravensbuyer',
        },
        {
          id: 'v-negative',
          label: 'Steelers',
          priceUsd: 20,
          quantityRemaining: -1,
          status: 'available',
          sortOrder: 1,
          isHot: false,
          buyerUsername: null,
        },
      ],
    });

    expect(rows.find((r) => r.id === 'v-taken')?.sold).toBe(true);
    expect(rows.find((r) => r.id === 'v-negative')?.sold).toBe(true);
  });

  it('also treats an explicit sold_out status as sold regardless of quantityRemaining', () => {
    const rows = buildVariantSpotDisplayRows({
      salesFormat: 'variant_selection',
      variantAssignmentMode: 'pick',
      variants: [
        {
          id: 'v-sold-out-status',
          label: 'Browns',
          priceUsd: 20,
          quantityRemaining: 5,
          status: 'sold_out',
          sortOrder: 0,
          isHot: false,
          buyerUsername: null,
        },
      ],
    });

    expect(rows[0]?.sold).toBe(true);
    expect(rows[0]?.unavailable).toBe(false);
  });

  it('keeps removed teams on the board as unavailable (not sold, not hidden)', () => {
    const rows = buildVariantSpotDisplayRows({
      salesFormat: 'variant_selection',
      variantAssignmentMode: 'pick',
      variants: [
        {
          id: 'v-open',
          label: 'Cowboys',
          priceUsd: 25,
          quantityRemaining: 1,
          status: 'available',
          sortOrder: 0,
          isHot: false,
          buyerUsername: null,
        },
        {
          id: 'v-removed',
          label: 'Giants',
          priceUsd: 25,
          quantityRemaining: 0,
          status: 'removed',
          sortOrder: 1,
          isHot: true,
          buyerUsername: null,
        },
      ],
    });

    expect(rows).toHaveLength(2);
    const removed = rows.find((r) => r.id === 'v-removed');
    expect(removed?.unavailable).toBe(true);
    expect(removed?.sold).toBe(false);
    expect(removed?.isHot).toBe(false);
    expect(removed?.buyerUsername).toBeNull();

    const summary = summarizeVariantSpotBoard({
      salesFormat: 'variant_selection',
      variantAssignmentMode: 'pick',
      variants: [
        {
          id: 'v-open',
          label: 'Cowboys',
          priceUsd: 25,
          quantityRemaining: 1,
          status: 'available',
          sortOrder: 0,
          isHot: false,
          buyerUsername: null,
        },
        {
          id: 'v-removed',
          label: 'Giants',
          priceUsd: 25,
          quantityRemaining: 0,
          status: 'removed',
          sortOrder: 1,
          isHot: false,
          buyerUsername: null,
        },
      ],
    });
    expect(summary.openCount).toBe(1);
    expect(summary.soldCount).toBe(0);
    expect(summary.unavailableCount).toBe(1);
  });

  it('returns an empty list when variants are missing or the format is not a variant sale', () => {
    expect(
      buildVariantSpotDisplayRows({
        salesFormat: 'variant_selection',
        variantAssignmentMode: 'pick',
        variants: [],
      }),
    ).toEqual([]);

    expect(
      buildVariantSpotDisplayRows({
        salesFormat: 'auction',
        variantAssignmentMode: 'pick',
        variants: [
          {
            id: 'v-1',
            label: 'Chiefs',
            priceUsd: 20,
            quantityRemaining: 5,
            status: 'available',
            sortOrder: 0,
            isHot: false,
            buyerUsername: null,
          },
        ],
      }),
    ).toEqual([]);

    expect(buildVariantSpotDisplayRows({ salesFormat: undefined, variantAssignmentMode: 'pick' })).toEqual([]);
  });
});

describe('mergeRandomSpotClaimIntoItem', () => {
  it('appends a new claim', () => {
    const item = makeItemRow({ randomSpotClaims: [] });
    const merged = mergeRandomSpotClaimIntoItem(item, { label: 'Chiefs', buyerUsername: '@buyer1' });
    expect(merged.randomSpotClaims).toEqual([{ label: 'Chiefs', buyerUsername: 'buyer1' }]);
  });

  it('dedupes a claim for a label that was already recorded (case-insensitive)', () => {
    const item = makeItemRow({
      randomSpotClaims: [{ label: 'Chiefs', buyerUsername: 'buyer1' }],
    });
    const merged = mergeRandomSpotClaimIntoItem(item, { label: 'chiefs', buyerUsername: '@buyer2' });
    expect(merged.randomSpotClaims).toEqual([{ label: 'Chiefs', buyerUsername: 'buyer1' }]);
    expect(merged).toBe(item);
  });

  it('ignores a claim with an empty label or buyer username', () => {
    const item = makeItemRow({ randomSpotClaims: [] });
    expect(mergeRandomSpotClaimIntoItem(item, { label: '  ', buyerUsername: 'buyer1' })).toBe(item);
    expect(mergeRandomSpotClaimIntoItem(item, { label: 'Chiefs', buyerUsername: '  ' })).toBe(item);
  });
});

describe('summarizeVariantSpotBoard (FIX 6 reconciliation)', () => {
  it('pick mode: reconciles open/sold counts from the per-variant rows', () => {
    const summary = summarizeVariantSpotBoard({
      salesFormat: 'variant_selection',
      variantAssignmentMode: 'pick',
      variants: [
        {
          id: 'v-open',
          label: 'Bengals',
          priceUsd: 20,
          quantityRemaining: 3,
          status: 'available',
          sortOrder: 0,
          isHot: false,
          buyerUsername: null,
        },
        {
          id: 'v-sold',
          label: 'Bills',
          priceUsd: 25,
          quantityRemaining: 0,
          status: 'available',
          sortOrder: 1,
          isHot: false,
          buyerUsername: '@buyer2',
        },
      ],
    });

    expect(summary.rows).toHaveLength(2);
    expect(summary.openCount).toBe(1);
    expect(summary.soldCount).toBe(1);
  });

  it('random pool: prefers authoritative quantityRemaining over randomSpotClaims.length when they disagree', () => {
    const totalTeams = NFL_TEAMS_LENGTH();
    // Claim feed lagging: only 1 claim recorded, but the pool variant reports far fewer remaining
    // (e.g. paid purchases the realtime claim feed hasn't caught up with yet).
    const summary = summarizeVariantSpotBoard({
      salesFormat: 'variant_selection',
      variantAssignmentMode: 'random',
      variants: [
        {
          id: 'pool',
          label: 'Random NFL Team',
          priceUsd: 25,
          quantityRemaining: totalTeams - 5,
          status: 'available',
          sortOrder: 0,
          isHot: false,
          buyerUsername: null,
        },
      ],
      randomSpotClaims: [{ label: 'Chiefs', buyerUsername: 'buyer1' }],
    });

    expect(summary.rows).toHaveLength(totalTeams);
    // Authoritative count wins, NOT `rows.length - claims.length` (which would be totalTeams - 1).
    expect(summary.openCount).toBe(totalTeams - 5);
    expect(summary.soldCount).toBe(5);
  });

  it('random pool: clamps quantityRemaining into [0, rows.length] so it can never disagree in the opposite direction', () => {
    const totalTeams = NFL_TEAMS_LENGTH();
    const summary = summarizeVariantSpotBoard({
      salesFormat: 'variant_selection',
      variantAssignmentMode: 'random',
      variants: [
        {
          id: 'pool',
          label: 'Random NFL Team',
          priceUsd: 25,
          quantityRemaining: totalTeams + 100,
          status: 'available',
          sortOrder: 0,
          isHot: false,
          buyerUsername: null,
        },
      ],
    });

    expect(summary.openCount).toBe(totalTeams);
    expect(summary.soldCount).toBe(0);
  });

  it('random pool: falls back to claims-based counting when quantityRemaining is not a finite number', () => {
    const totalDivisions = NFL_DIVISIONS_LENGTH();
    const summary = summarizeVariantSpotBoard({
      salesFormat: 'team_break',
      variantAssignmentMode: 'random',
      variants: [
        {
          id: 'pool',
          label: 'Random NFL Division',
          priceUsd: 40,
          quantityRemaining: Number.NaN,
          status: 'available',
          sortOrder: 0,
          isHot: false,
          buyerUsername: null,
        },
      ],
      randomSpotClaims: [{ label: 'AFC East', buyerUsername: 'buyer1' }],
    });

    expect(summary.openCount).toBe(totalDivisions - 1);
    expect(summary.soldCount).toBe(1);
  });

  it('returns zeroed counts gracefully for an empty/non-variant item', () => {
    expect(
      summarizeVariantSpotBoard({ salesFormat: 'auction', variantAssignmentMode: 'pick', variants: [] }),
    ).toEqual({ rows: [], openCount: 0, soldCount: 0, unavailableCount: 0 });
  });
});

function NFL_TEAMS_LENGTH(): number {
  return buildVariantSpotDisplayRows({
    salesFormat: 'variant_selection',
    variantAssignmentMode: 'random',
    variants: [
      {
        id: 'pool',
        label: 'Random NFL Team',
        priceUsd: 25,
        quantityRemaining: 0,
        status: 'available',
        sortOrder: 0,
        isHot: false,
        buyerUsername: null,
      },
    ],
  }).length;
}

function NFL_DIVISIONS_LENGTH(): number {
  return buildVariantSpotDisplayRows({
    salesFormat: 'team_break',
    variantAssignmentMode: 'random',
    variants: [
      {
        id: 'pool',
        label: 'Random NFL Division',
        priceUsd: 40,
        quantityRemaining: 0,
        status: 'available',
        sortOrder: 0,
        isHot: false,
        buyerUsername: null,
      },
    ],
  }).length;
}
