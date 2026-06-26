import { describe, expect, it } from 'vitest';
import {
  buildExclusiveHostPinUpdates,
  hostPinnedBuyerVariant,
  pinnedVariantBuyerPrimaryLabel,
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

  it('formats buyer CTA labels', () => {
    expect(pinnedVariantBuyerPrimaryLabel('variant_selection', 49)).toBe('Buy Now $49.00');
    expect(pinnedVariantBuyerPrimaryLabel('team_break', 35)).toBe('Claim Team $35.00');
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
          },
        ],
        'pick',
      ),
    ).toBeNull();
  });
});
