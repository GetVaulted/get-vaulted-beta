import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { BuyerWalletSummary } from '../api/buyerWalletRepository';
import {
  WALLET_SAVABLE_METHOD_CATALOG,
  shouldShowWalletCatalogEntry,
  type WalletMethodCatalogEntry,
} from './paymentMethodCatalog';

/** Live in-room wallet sheet title — Get Vaulted branded, not generic "Wallet". */
export const LIVE_PREMIUM_WALLET_TITLE = 'Get Vaulted Premium';

export type LiveWalletCapabilities = Pick<
  NonNullable<BuyerWalletSummary['capabilities']>,
  'link' | 'cashAppPay' | 'amazonPay' | 'paypal'
> | null;

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Payment methods buyers can use on Live (instant / off-session via Stripe). */
export function liveAcceptedWalletMethods(
  platform: 'ios' | 'android' | 'web',
  capabilities?: LiveWalletCapabilities,
): WalletMethodCatalogEntry[] {
  return WALLET_SAVABLE_METHOD_CATALOG.filter((entry) => {
    if (!entry.eligibility.includes('live')) return false;
    if (!shouldShowWalletCatalogEntry(entry, platform)) return false;
    if (entry.id === 'link' && capabilities && !capabilities.link) return false;
    if (entry.id === 'cash_app_pay' && capabilities && !capabilities.cashAppPay) return false;
    if (entry.id === 'amazon_pay' && capabilities && !capabilities.amazonPay) return false;
    return true;
  });
}

export function liveAcceptedMethodsLabel(
  platform: 'ios' | 'android' | 'web',
  capabilities?: LiveWalletCapabilities,
): string {
  const labels = liveAcceptedWalletMethods(platform, capabilities).map((m) => m.label);
  if (labels.length === 0) return 'Card & digital wallets';
  if (labels.length <= 3) return labels.join(' · ');
  return `${labels.slice(0, 2).join(' · ')} +${labels.length - 2} more`;
}

export function catalogEntryIcon(entryId: string): IoniconName {
  switch (entryId) {
    case 'apple_pay':
      return 'logo-apple';
    case 'google_pay':
      return 'logo-google';
    case 'cash_app_pay':
      return 'cash-outline';
    case 'link':
      return 'link-outline';
    case 'amazon_pay':
      return 'logo-amazon';
    default:
      return 'card-outline';
  }
}
