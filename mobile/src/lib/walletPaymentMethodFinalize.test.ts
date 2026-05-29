import { describe, expect, it } from 'vitest';
import { paymentMethodIdFromSetupIntent } from './walletPaymentMethodFinalize';

describe('walletPaymentMethodFinalize', () => {
  it('reads payment method id from setup intent result', () => {
    expect(
      paymentMethodIdFromSetupIntent({
        paymentMethod: { id: 'pm_123456789012345678901234' },
        paymentMethodId: null,
      }),
    ).toBe('pm_123456789012345678901234');
    expect(
      paymentMethodIdFromSetupIntent({
        paymentMethod: null,
        paymentMethodId: 'pm_abcdefghijklmnopabcdefghij',
      }),
    ).toBe('pm_abcdefghijklmnopabcdefghij');
    expect(paymentMethodIdFromSetupIntent(null)).toBeNull();
  });
});
