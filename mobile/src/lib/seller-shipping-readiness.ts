import type { SellerReadinessChecks } from './seller-setup-state';
import { normalizePhoneForShippo } from './shippoLabelContacts';

export const SELLER_SHIP_FROM_COUNTRY = 'US';
export const SELLER_SHIP_FROM_COUNTRY_LABEL = 'United States';

export type SellerShipFromFields = {
  shipFromName?: string | null;
  shipFromStreet?: string | null;
  shipFromCity?: string | null;
  shipFromState?: string | null;
  shipFromZip?: string | null;
  shipFromCountry?: string | null;
  shipFromPhone?: string | null;
};

/** Mirrors web `hasCompleteSellerShipFrom` — address + USPS contact phone. */
export function hasCompleteSellerShipFrom(s: SellerShipFromFields | null | undefined): boolean {
  if (!s) return false;
  const addressComplete = Boolean(
    s.shipFromStreet?.trim() &&
      s.shipFromCity?.trim() &&
      s.shipFromState?.trim() &&
      s.shipFromZip?.trim() &&
      (s.shipFromCountry?.trim() || SELLER_SHIP_FROM_COUNTRY),
  );
  return addressComplete && normalizePhoneForShippo(s.shipFromPhone) !== null;
}

/** Unified ship-from gate: API readiness checks and/or persisted seller profile fields. */
export function sellerHasShipFromAddress(
  checks: SellerReadinessChecks | null | undefined,
  seller: SellerShipFromFields | null | undefined,
): boolean {
  return Boolean(checks?.hasShipFromAddress) || hasCompleteSellerShipFrom(seller);
}

export function normalizeSellerShipFromZip(zip: string | null | undefined): string | null {
  const digits = (zip ?? '').replace(/\D/g, '').slice(0, 5);
  return digits.length === 5 ? digits : null;
}

export function formatSellerShipFromSummary(s: SellerShipFromFields | null | undefined): string {
  if (!s) return '';
  const parts = [
    s.shipFromStreet,
    s.shipFromCity,
    s.shipFromState,
    s.shipFromZip,
    s.shipFromCountry?.trim() || SELLER_SHIP_FROM_COUNTRY,
  ]
    .map((v) => v?.trim())
    .filter(Boolean);
  return parts.join(', ');
}
