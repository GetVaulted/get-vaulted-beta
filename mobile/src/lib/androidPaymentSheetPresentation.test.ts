import { describe, expect, it } from 'vitest';
import {
  shouldOpenWalletPaymentSetupOnRecovery,
  shouldUseAndroidPaymentSheetForCard,
  walletRecoveryPaymentSetupStartWith,
} from './androidPaymentSheetPresentation';

describe('androidPaymentSheetPresentation', () => {
  it('opens picker on Android recovery so PaymentSheet is not auto-launched in a Modal', () => {
    expect(walletRecoveryPaymentSetupStartWith('android')).toBe('picker');
    expect(walletRecoveryPaymentSetupStartWith('ios')).toBe('card');
  });

  it('still opens payment setup for card recovery (not shipping)', () => {
    expect(shouldOpenWalletPaymentSetupOnRecovery({ shippingRecovery: false })).toBe(true);
    expect(shouldOpenWalletPaymentSetupOnRecovery({ shippingRecovery: true })).toBe(false);
  });

  it('uses PaymentSheet for card entry only on Android', () => {
    expect(shouldUseAndroidPaymentSheetForCard('android')).toBe(true);
    expect(shouldUseAndroidPaymentSheetForCard('ios')).toBe(false);
  });
});
