import { describe, expect, it } from 'vitest';
import {
  buildExclusiveHostPinUpdates,
  hostPinnedBuyerVariant,
  pinnedVariantBuyerPrimaryLabel,
  variantClaimPrimaryLabel,
} from './liveItemVariant';

describe('liveItemVariant host pin helpers', () => {
  it('returns the available hot variant for pick-mode boards', () => {
    const pinned = hostPinnedBuyerVariant(
      [
        {
          id: 'a',
          label: 'Chiefs',
          priceUsd: 40,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: true,
          status: 'available',
          buyerUsername: null,
          sortOrder: 0,
        },
        {
          id: 'b',
          label: 'Bills',
          priceUsd: 40,
          quantityRemaining: 1,
          soldCount: 0,
          isHot: false,
          status: 'available',
          buyerUsername: null,
          sortOrder: 1,
        },
      ],
      'pick',
    );
    expect(pinned?.id).toBe('a');
  });

  it('builds exclusive pin updates', () => {
    expect(buildExclusiveHostPinUpdates([{ id: 'a' }, { id: 'b' }], 'b')).toEqual([
      { id: 'a', isHot: false },
      { id: 'b', isHot: true },
    ]);
  });

  it('formats spot auction bid labels', () => {
    expect(pinnedVariantBuyerPrimaryLabel('variant_selection', 49)).toBe('Place bid $49.00');
    expect(pinnedVariantBuyerPrimaryLabel('team_break', 35)).toBe('Bid $35.00');
  });

  it('formats self-serve claim labels', () => {
    expect(variantClaimPrimaryLabel('variant_selection')).toBe('Claim Team');
    expect(variantClaimPrimaryLabel('team_break')).toBe('Claim Division');
  });

  it('ignores sold hot variant for buyer pin', () => {
    expect(
      hostPinnedBuyerVariant(
        [
          {
            id: 'sold-hot',
            label: 'Chiefs',
            priceUsd: 40,
            quantityRemaining: 0,
            soldCount: 1,
            isHot: true,
            status: 'sold_out',
            buyerUsername: '@buyer',
            sortOrder: 0,
          },
        ],
        'pick',
      ),
    ).toBeNull();
  });
});
