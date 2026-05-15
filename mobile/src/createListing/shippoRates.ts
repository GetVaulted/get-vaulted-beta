/** Carrier rate returned from Shippo (via Netlify) for listing checkout estimates. */
export type ListingShippoRate = {
  id: string;
  carrier: string;
  serviceLevel: string;
  estimatedDelivery: string;
  amount: string;
  currency: string;
  trackingIncluded: boolean;
  insuranceAvailable: boolean;
};

export function formatListingRatePrice(amount: string, currency: string, handlingFee = 0): string {
  const base = Number(amount);
  if (!Number.isFinite(base)) return amount;
  const total = base + handlingFee;
  const cur = currency.toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(total);
  } catch {
    return `$${total.toFixed(2)}`;
  }
}

export function listingRateLabel(rate: ListingShippoRate): string {
  return `${rate.carrier} ${rate.serviceLevel}`.trim();
}

export function parsePackageNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parses lb/oz fields; empty lb counts as 0. Returns total pounds for Shippo, or null if invalid. */
export function packageWeightLbTotal(form: { packageWeightLb: string; packageWeightOz: string }): number | null {
  const lbRaw = form.packageWeightLb.trim();
  const ozRaw = form.packageWeightOz.trim();
  if (!lbRaw && !ozRaw) return null;

  const lb = lbRaw === '' ? 0 : Number(lbRaw.replace(/,/g, ''));
  const oz = ozRaw === '' ? 0 : Number(ozRaw.replace(/,/g, ''));
  if (!Number.isFinite(lb) || lb < 0 || !Number.isFinite(oz) || oz < 0) return null;

  const total = lb + oz / 16;
  return total > 0 ? total : null;
}

export function isPackageDetailsComplete(form: {
  packageWeightLb: string;
  packageWeightOz: string;
  packageLengthIn: string;
  packageWidthIn: string;
  packageHeightIn: string;
  shipFromZip: string;
}): boolean {
  return (
    packageWeightLbTotal(form) != null &&
    parsePackageNumber(form.packageLengthIn) != null &&
    parsePackageNumber(form.packageWidthIn) != null &&
    parsePackageNumber(form.packageHeightIn) != null &&
    /^\d{5}$/.test(form.shipFromZip.replace(/\D/g, '').slice(0, 5))
  );
}
