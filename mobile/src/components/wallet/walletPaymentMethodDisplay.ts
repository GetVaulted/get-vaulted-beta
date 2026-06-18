import type { Ionicons } from '@expo/vector-icons';
import type { BuyerPaymentMethodRow } from '../../api/buyerWalletRepository';

export type WalletPmType =
  | 'card'
  | 'apple_pay'
  | 'google_pay'
  | 'link'
  | 'cash_app_pay'
  | 'paypal'
  | 'venmo';

export function normalizePmType(type?: string): WalletPmType {
  switch (type) {
    case 'apple_pay':
    case 'google_pay':
    case 'link':
    case 'cash_app_pay':
    case 'paypal':
    case 'venmo':
      return type;
    default:
      return 'card';
  }
}

export function walletPmIcon(type: WalletPmType): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'apple_pay':
      return 'logo-apple';
    case 'google_pay':
      return 'logo-google';
    case 'link':
      return 'link-outline';
    case 'cash_app_pay':
      return 'cash-outline';
    case 'paypal':
      return 'logo-paypal';
    case 'venmo':
      return 'wallet-outline';
    default:
      return 'card-outline';
  }
}

export function walletPmLabel(method: BuyerPaymentMethodRow): string {
  const type = normalizePmType(method.type);
  switch (type) {
    case 'apple_pay':
      return 'Apple Pay';
    case 'google_pay':
      return 'Google Pay';
    case 'link':
      return 'Link';
    case 'cash_app_pay':
      return 'Cash App Pay';
    case 'paypal':
      return 'PayPal';
    case 'venmo':
      return 'Venmo';
    default:
      return method.brand?.trim() || 'Card';
  }
}

export function walletPmSummary(method: BuyerPaymentMethodRow | null): string {
  if (!method) return 'Add payment method';
  const label = walletPmLabel(method);
  const type = normalizePmType(method.type);
  if (type === 'card' && method.last4) return `${label} ···· ${method.last4}`;
  if (method.last4 && method.last4 !== '····') return `${label} · ${method.last4}`;
  return label;
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
