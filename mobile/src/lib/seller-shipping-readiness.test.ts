import { describe, expect, it } from 'vitest';
import {
  formatSellerShipFromSummary,
  hasCompleteSellerShipFrom,
  sellerHasShipFromAddress,
} from './seller-shipping-readiness';

describe('hasCompleteSellerShipFrom', () => {
  it('returns true when all ship-from fields are present', () => {
    expect(
      hasCompleteSellerShipFrom({
        shipFromStreet: '123 Main St',
        shipFromCity: 'Austin',
        shipFromState: 'TX',
        shipFromZip: '78701',
        shipFromCountry: 'US',
      }),
    ).toBe(true);
  });

  it('defaults country to US when missing', () => {
    expect(
      hasCompleteSellerShipFrom({
        shipFromStreet: '123 Main St',
        shipFromCity: 'Austin',
        shipFromState: 'TX',
        shipFromZip: '78701',
        shipFromCountry: null,
      }),
    ).toBe(true);
  });

  it('returns false when street is missing', () => {
    expect(
      hasCompleteSellerShipFrom({
        shipFromStreet: '',
        shipFromCity: 'Austin',
        shipFromState: 'TX',
        shipFromZip: '78701',
        shipFromCountry: 'US',
      }),
    ).toBe(false);
  });
});

describe('sellerHasShipFromAddress', () => {
  it('uses readiness checks when true', () => {
    expect(
      sellerHasShipFromAddress(
        { hasStripeAccount: true, stripeChargesEnabled: true, hasShipFromAddress: true },
        null,
      ),
    ).toBe(true);
  });

  it('falls back to seller profile fields when checks are stale', () => {
    expect(
      sellerHasShipFromAddress(
        { hasStripeAccount: true, stripeChargesEnabled: true, hasShipFromAddress: false },
        {
          shipFromStreet: '123 Main St',
          shipFromCity: 'Austin',
          shipFromState: 'TX',
          shipFromZip: '78701',
          shipFromCountry: 'US',
        },
      ),
    ).toBe(true);
  });
});

describe('formatSellerShipFromSummary', () => {
  it('joins address parts', () => {
    expect(
      formatSellerShipFromSummary({
        shipFromStreet: '123 Main St',
        shipFromCity: 'Austin',
        shipFromState: 'TX',
        shipFromZip: '78701',
        shipFromCountry: 'US',
      }),
    ).toBe('123 Main St, Austin, TX, 78701, US');
  });
});
