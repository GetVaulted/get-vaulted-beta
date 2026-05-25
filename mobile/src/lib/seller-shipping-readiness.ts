import type { SellerReadinessChecks } from './seller-setup-state';

export const SELLER_SHIP_FROM_COUNTRY = 'US';
export const SELLER_SHIP_FROM_COUNTRY_LABEL = 'United States';

export type SellerShipFromFields = {
  shipFromName?: string | null;
  shipFromStreet?: string | null;
  shipFromCity?: string | null;
  shipFromState?: string | null;
  shipFromZip?: string | null;
  shipFromCountry?: string | null;
};

/** Mirrors web `hasCompleteSellerShipFrom` — canonical seller ship-from on User row. */
export function hasCompleteSellerShipFrom(s: SellerShipFromFields | null | undefined): boolean {
  if (!s) return false;
  return Boolean(
    s.shipFromStreet?.trim() &&
      s.shipFromCity?.trim() &&
      s.shipFromState?.trim() &&
      s.shipFromZip?.trim() &&
      (s.shipFromCountry?.trim() || SELLER_SHIP_FROM_COUNTRY),
  );
}

/** Unified ship-from gate: API readiness checks and/or persisted seller profile fields. */
export function sellerHasShipFromAddress(
  checks: SellerReadinessChecks | null | undefined,
  seller: SellerShipFromFields | null | undefined,
): boolean {
  return Boolean(checks?.hasShipFromAddress) || hasCompleteSellerShipFrom(seller);
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
