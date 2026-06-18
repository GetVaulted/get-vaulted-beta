import type { BuyerPaymentMethodRow, BuyerShippingAddressRow } from '../../api/buyerWalletRepository';
import { walletPmSummary } from './walletPaymentMethodDisplay';

export function pickDefaultShippingAddress(
  addresses: BuyerShippingAddressRow[],
): BuyerShippingAddressRow | null {
  if (!addresses.length) return null;
  return addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
}

export function pickPrimaryPaymentMethod(
  methods: BuyerPaymentMethodRow[],
): BuyerPaymentMethodRow | null {
  return methods.find((m) => m.isDefault) ?? methods[0] ?? null;
}

export function formatPaymentSummary(method: BuyerPaymentMethodRow | null): string {
  return walletPmSummary(method);
}

export function formatAddressOneLine(address: BuyerShippingAddressRow | null): string {
  if (!address) return 'Add shipping address';
  const street = [address.line1, address.line2].filter(Boolean).join(', ');
  const cityLine = `${address.city}, ${address.state} ${address.postalCode}`;
  return [street, cityLine].filter(Boolean).join(' · ');
}

export function formatAddressBlock(address: BuyerShippingAddressRow): string {
  const lines = [
    address.fullName,
    address.line1,
    address.line2,
    `${address.city}, ${address.state} ${address.postalCode}`,
    address.country,
  ].filter(Boolean) as string[];
  return lines.join('\n');
}

export function formatCardExp(month: number, year: number): string {
  if (!month || !year) return '';
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
}
