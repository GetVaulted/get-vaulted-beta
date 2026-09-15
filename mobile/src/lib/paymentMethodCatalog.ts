export type WalletMethodEligibility = 'live' | 'marketplace' | 'trade' | 'marketplace_only';

export type WalletMethodCatalogEntry = {
  id: string;
  label: string;
  eligibility: WalletMethodEligibility[];
  savableInWallet: boolean;
  /** Hide on iOS (e.g. Google Pay). */
  hideOnIos?: boolean;
  /** Hide on Android (e.g. Apple Pay). */
  hideOnAndroid?: boolean;
};

export const WALLET_SAVABLE_METHOD_CATALOG: WalletMethodCatalogEntry[] = [
  {
    id: 'apple_pay',
    label: 'Apple Pay',
    eligibility: ['live', 'marketplace', 'trade'],
    savableInWallet: true,
    hideOnAndroid: true,
  },
  {
    id: 'google_pay',
    label: 'Google Pay',
    eligibility: ['live', 'marketplace', 'trade'],
    savableInWallet: true,
    hideOnIos: true,
  },
  {
    id: 'card',
    label: 'Credit / Debit Card',
    eligibility: ['live', 'marketplace', 'trade'],
    savableInWallet: true,
  },
  {
    id: 'cash_app_pay',
    label: 'Cash App Pay',
    eligibility: ['live', 'marketplace', 'trade'],
    savableInWallet: true,
  },
  {
    id: 'link',
    label: 'Link',
    eligibility: ['live', 'marketplace', 'trade'],
    savableInWallet: true,
  },
  {
    id: 'amazon_pay',
    label: 'Amazon Pay',
    eligibility: ['live', 'marketplace', 'trade'],
    savableInWallet: true,
  },
  {
    id: 'venmo',
    label: 'Venmo',
    eligibility: ['live', 'marketplace', 'trade'],
    savableInWallet: true,
  },
  {
    id: 'paypal',
    label: 'PayPal',
    eligibility: ['live', 'marketplace', 'trade'],
    savableInWallet: true,
  },
];

export const WALLET_MARKETPLACE_BNPL_CATALOG: WalletMethodCatalogEntry[] = [
  {
    id: 'affirm',
    label: 'Affirm',
    eligibility: ['marketplace_only'],
    savableInWallet: false,
  },
  {
    id: 'klarna',
    label: 'Klarna',
    eligibility: ['marketplace_only'],
    savableInWallet: false,
  },
  {
    id: 'afterpay_clearpay',
    label: 'Afterpay / Clearpay',
    eligibility: ['marketplace_only'],
    savableInWallet: false,
  },
];

const ELIGIBILITY_LABELS: Record<WalletMethodEligibility, string> = {
  live: 'Live',
  marketplace: 'Marketplace',
  trade: 'Trade',
  marketplace_only: 'Marketplace checkout only',
};

export function walletMethodEligibilityLabel(entry: WalletMethodCatalogEntry): string {
  if (entry.eligibility.length === 1 && entry.eligibility[0] === 'marketplace_only') {
    return ELIGIBILITY_LABELS.marketplace_only;
  }
  const parts = entry.eligibility
    .filter((e) => e !== 'marketplace_only')
    .map((e) => ELIGIBILITY_LABELS[e]);
  return parts.length ? `Available for ${parts.join(', ')}` : ELIGIBILITY_LABELS.marketplace_only;
}

export function shouldShowWalletCatalogEntry(
  entry: WalletMethodCatalogEntry,
  platform: 'ios' | 'android' | 'web',
): boolean {
  if (platform === 'ios' && entry.hideOnIos) return false;
  if (platform === 'android' && entry.hideOnAndroid) return false;
  return true;
}

export function shouldShowApplePay(platform: 'ios' | 'android' | 'web', supported: boolean): boolean {
  return platform === 'ios' && supported;
}

export function shouldShowGooglePay(platform: 'ios' | 'android' | 'web', supported: boolean): boolean {
  return platform === 'android' && supported;
}
