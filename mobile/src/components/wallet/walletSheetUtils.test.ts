import { describe, expect, it } from 'vitest';
import {
  formatAddressOneLine,
  formatPaymentSummary,
  pickDefaultShippingAddress,
  pickPrimaryPaymentMethod,
} from './walletSheetUtils';

describe('walletSheetUtils', () => {
  it('formats missing payment and address states', () => {
    expect(formatPaymentSummary(null)).toBe('Add payment method');
    expect(formatAddressOneLine(null)).toBe('Add shipping address');
  });

  it('picks default shipping address', () => {
    const list = [
      { id: '1', name: 'Home', fullName: 'A', line1: '1 Main', line2: null, city: 'LA', state: 'CA', postalCode: '90001', country: 'US', isDefault: false },
      { id: '2', name: 'Ship', fullName: 'B', line1: '2 Oak', line2: null, city: 'LA', state: 'CA', postalCode: '90002', country: 'US', isDefault: true },
    ];
    expect(pickDefaultShippingAddress(list)?.id).toBe('2');
    expect(formatPaymentSummary({ id: 'pm', brand: 'Visa', last4: '4242', expMonth: 12, expYear: 2030 })).toBe('Visa ···· 4242');
    expect(pickPrimaryPaymentMethod([{ id: 'pm', brand: 'Visa', last4: '4242', expMonth: 1, expYear: 2030 }])?.id).toBe('pm');
  });
});
