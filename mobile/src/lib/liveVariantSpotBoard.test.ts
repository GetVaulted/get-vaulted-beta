import { describe, expect, it } from 'vitest';
import { spotAccentColor, segmentColorForLabel } from './liveBreakPresets';
import { buildVariantSpotDisplayRows } from './liveVariantSpotBoard';

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
