/** Seller-defined scope for which Shippo quotes buyers may choose at marketplace checkout. */
export type MarketplaceShippingOfferScope = 'all' | 'no_overnight' | 'custom';

/** Carrier rate returned from Shippo (via Netlify) for listing checkout estimates. */
export type ListingShippoRate = {
  id: string;
  carrier: string;
  serviceLevel: string;
  estimatedDelivery: string;
  estimatedDays?: number | null;
  amount: string;
  currency: string;
  trackingIncluded: boolean;
  insuranceAvailable: boolean;
};

export const MARKETPLACE_CARRIER_LABELS: Record<string, string> = {
  usps: 'USPS',
  ups: 'UPS',
  fedex: 'FedEx',
  dhl: 'DHL',
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

export function normalizeMarketplaceCarrierKey(carrier: string): string {
  const raw = carrier.trim().toLowerCase();
  if (!raw) return 'unknown';
  if (raw.includes('usps') || raw.includes('postal')) return 'usps';
  if (raw.includes('fedex') || raw.includes('fed ex')) return 'fedex';
  if (raw === 'ups' || raw.startsWith('ups ') || raw.includes('united parcel')) return 'ups';
  if (raw.includes('dhl')) return 'dhl';
  return raw.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unknown';
}

export function marketplaceCarrierLabel(key: string): string {
  return MARKETPLACE_CARRIER_LABELS[normalizeMarketplaceCarrierKey(key)] ?? key.trim().toUpperCase();
}

/** Stable key for allowlists across listing save + checkout matching (same package lanes). */
export function marketplaceListingRateKey(rate: Pick<ListingShippoRate, 'carrier' | 'serviceLevel'>): string {
  return `${rate.carrier.trim().toLowerCase()}|${rate.serviceLevel.trim().toLowerCase()}`;
}

/** Heuristic: hide next-flight / overnight-class services when seller excludes them. */
export function isLikelyOvernightOrExpressAirRate(rate: ListingShippoRate): boolean {
  const blob = `${rate.carrier} ${rate.serviceLevel} ${rate.estimatedDelivery}`.toLowerCase();
  return (
    /\bovernight\b/.test(blob) ||
    /\bnext[-\s]?day\b/.test(blob) ||
    /\bone[-\s]?day\b/.test(blob) ||
    /\bnday\b/.test(blob) ||
    /priority mail express/.test(blob) ||
    /ups\s+next\s+day\b/.test(blob) ||
    /fedex\s+(standard\s+overnight|priority\s*overnight|first\s*overnight)/.test(blob)
  );
}

function cheapestRatePerCarrier(rates: ListingShippoRate[]): ListingShippoRate[] {
  const byCarrier = new Map<string, ListingShippoRate>();
  for (const rate of rates) {
    const carrierKey = normalizeMarketplaceCarrierKey(rate.carrier);
    const prev = byCarrier.get(carrierKey);
    if (!prev || Number(rate.amount) < Number(prev.amount)) {
      byCarrier.set(carrierKey, rate);
    }
  }
  return [...byCarrier.values()].sort((a, b) => Number(a.amount) - Number(b.amount));
}

/** Rates a buyer may be offered at checkout given seller rules + carrier allowlist. */
export function marketplaceOfferableRates(
  rates: ListingShippoRate[],
  scope: MarketplaceShippingOfferScope,
  allowedKeys: string[],
  allowedCarriers: string[] = [],
): ListingShippoRate[] {
  if (rates.length === 0) return [];
  let list = rates;

  if (allowedCarriers.length > 0) {
    const carrierSet = new Set(allowedCarriers.map(normalizeMarketplaceCarrierKey));
    list = list.filter((r) => carrierSet.has(normalizeMarketplaceCarrierKey(r.carrier)));
  }

  if (scope === 'no_overnight') {
    list = list.filter((r) => !isLikelyOvernightOrExpressAirRate(r));
  }

  if (scope === 'custom' && allowedKeys.length > 0) {
    const set = new Set(allowedKeys);
    list = list.filter((r) => set.has(marketplaceListingRateKey(r)));
  }

  return cheapestRatePerCarrier(list);
}

export function uniqueCarriersFromRates(rates: ListingShippoRate[]): string[] {
  return [...new Set(rates.map((r) => normalizeMarketplaceCarrierKey(r.carrier)))].filter((k) => k !== 'unknown');
}

/** Marketplace publish: package OK + at least one preview rate + offerable set non-empty. */
export function marketplaceShippingListingReady(form: {
  packageWeightLb: string;
  packageWeightOz: string;
  packageLengthIn: string;
  packageWidthIn: string;
  packageHeightIn: string;
  shipFromZip: string;
  marketplaceRatesPreviewOk: boolean;
  marketplaceOfferableRateCount: number;
  marketplaceShippingOfferScope: MarketplaceShippingOfferScope;
  marketplaceAllowedRateKeys: string[];
  marketplaceAllowedCarriers: string[];
}): boolean {
  if (!isPackageDetailsComplete(form)) return false;
  if (!form.marketplaceRatesPreviewOk || form.marketplaceOfferableRateCount < 1) return false;
  if (form.marketplaceAllowedCarriers.length === 0) return false;
  if (form.marketplaceShippingOfferScope === 'custom' && form.marketplaceAllowedRateKeys.length === 0) return false;
  return true;
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
