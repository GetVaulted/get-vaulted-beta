export type BillingCountry = {
  code: string;
  label: string;
};

export const WALLET_BILLING_COUNTRIES: BillingCountry[] = [
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'AU', label: 'Australia' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'MX', label: 'Mexico' },
];

export function billingCountryLabel(code: string): string {
  return WALLET_BILLING_COUNTRIES.find((c) => c.code === code)?.label ?? code;
}
