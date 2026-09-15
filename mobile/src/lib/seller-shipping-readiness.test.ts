import { describe, expect, it } from 'vitest';
import {
  formatSellerShipFromSummary,
  hasCompleteSellerShipFrom,
  sellerHasShipFromAddress,
} from './seller-shipping-readiness';

const completeSeller = {
  shipFromStreet: '123 Main St',
  shipFromCity: 'Austin',
  shipFromState: 'TX',
  shipFromZip: '78701',
  shipFromCountry: 'US',
  shipFromPhone: '5551234567',
};

describe('hasCompleteSellerShipFrom', () => {
  it('returns true when all ship-from fields and phone are present', () => {
    expect(hasCompleteSellerShipFrom(completeSeller)).toBe(true);
  });

  it('defaults country to US when missing', () => {
    expect(
      hasCompleteSellerShipFrom({
        ...completeSeller,
        shipFromCountry: null,
      }),
    ).toBe(true);
  });

  it('returns false when phone is missing', () => {
    expect(
      hasCompleteSellerShipFrom({
        ...completeSeller,
        shipFromPhone: null,
      }),
    ).toBe(false);
  });

  it('returns false when street is missing', () => {
    expect(
      hasCompleteSellerShipFrom({
        ...completeSeller,
        shipFromStreet: '',
      }),
    ).toBe(false);
  });
});

describe('sellerHasShipFromAddress', () => {
  it('uses readiness checks when true', () => {
    expect(
      sellerHasShipFromAddress(
        { hasStripeAccount: true, stripeChargesEnabled: true, stripePayoutSubmitted: true, hasShipFromAddress: true },
        null,
      ),
    ).toBe(true);
  });

  it('falls back to seller profile fields when checks are stale', () => {
    expect(
      sellerHasShipFromAddress(
        { hasStripeAccount: true, stripeChargesEnabled: true, stripePayoutSubmitted: true, hasShipFromAddress: false },
        completeSeller,
      ),
    ).toBe(true);
  });
});

describe('formatSellerShipFromSummary', () => {
  it('joins address parts', () => {
    expect(formatSellerShipFromSummary(completeSeller)).toBe('123 Main St, Austin, TX, 78701, US');
  });
});
