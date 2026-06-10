import { describe, expect, it } from 'vitest';
import {
  consumePendingMarketplaceListingAction,
  setPendingMarketplaceListingAction,
} from './marketplacePendingAction';

describe('marketplacePendingAction', () => {
  it('stores and consumes a pending listing action by listing id', () => {
    setPendingMarketplaceListingAction('listing-1', 'buy_now');
    expect(consumePendingMarketplaceListingAction('listing-1')).toBe('buy_now');
    expect(consumePendingMarketplaceListingAction('listing-1')).toBeNull();
  });

  it('ignores pending actions for a different listing', () => {
    setPendingMarketplaceListingAction('listing-a', 'make_offer');
    expect(consumePendingMarketplaceListingAction('listing-b')).toBeNull();
    expect(consumePendingMarketplaceListingAction('listing-a')).toBe('make_offer');
  });
});
