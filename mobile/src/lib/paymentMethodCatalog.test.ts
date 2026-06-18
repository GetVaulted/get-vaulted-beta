import { describe, expect, it } from 'vitest';
import {
  WALLET_MARKETPLACE_BNPL_CATALOG,
  WALLET_SAVABLE_METHOD_CATALOG,
  shouldShowApplePay,
  shouldShowGooglePay,
  shouldShowWalletCatalogEntry,
  walletMethodEligibilityLabel,
} from './paymentMethodCatalog';

describe('paymentMethodCatalog', () => {
  it('labels BNPL methods as marketplace checkout only', () => {
    for (const entry of WALLET_MARKETPLACE_BNPL_CATALOG) {
      expect(walletMethodEligibilityLabel(entry)).toBe('Marketplace checkout only');
    }
  });

  it('labels instant methods for live, marketplace, and trade', () => {
    const apple = WALLET_SAVABLE_METHOD_CATALOG.find((e) => e.id === 'apple_pay');
    expect(apple).toBeTruthy();
    expect(walletMethodEligibilityLabel(apple!)).toBe('Available for Live, Marketplace, Trade');
  });

  it('hides Apple Pay on Android and Google Pay on iOS', () => {
    const apple = WALLET_SAVABLE_METHOD_CATALOG.find((e) => e.id === 'apple_pay')!;
    const google = WALLET_SAVABLE_METHOD_CATALOG.find((e) => e.id === 'google_pay')!;
    expect(shouldShowWalletCatalogEntry(apple, 'ios')).toBe(true);
    expect(shouldShowWalletCatalogEntry(apple, 'android')).toBe(false);
    expect(shouldShowWalletCatalogEntry(google, 'android')).toBe(true);
    expect(shouldShowWalletCatalogEntry(google, 'ios')).toBe(false);
  });

  it('shows native wallet buttons only on supported platform', () => {
    expect(shouldShowApplePay('ios', true)).toBe(true);
    expect(shouldShowApplePay('android', true)).toBe(false);
    expect(shouldShowApplePay('ios', false)).toBe(false);
    expect(shouldShowGooglePay('android', true)).toBe(true);
    expect(shouldShowGooglePay('ios', true)).toBe(false);
  });
});
