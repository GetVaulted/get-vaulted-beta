import type { MarketplaceShippingOfferScope } from "@/generated/prisma/client";

export type MarketplaceCheckoutRateQuote = {
  id: string;
  carrier: string;
  serviceLevel: string;
  estimatedDelivery: string;
  estimatedDays: number | null;
  amount: string;
  currency: string;
  trackingIncluded: boolean;
  insuranceAvailable: boolean;
};

function normalizeMarketplaceRateKeyPart(value: string): string {
  return value.trim().toLowerCase();
}

/** Stable key for allowlists across listing save + checkout matching (same package lanes). */
export function marketplaceListingRateKey(rate: Pick<MarketplaceCheckoutRateQuote, "carrier" | "serviceLevel">): string {
  return `${normalizeMarketplaceRateKeyPart(rate.carrier)}|${normalizeMarketplaceRateKeyPart(rate.serviceLevel)}`;
}

/** Heuristic: hide next-flight / overnight-class services when seller excludes them. */
export function isLikelyOvernightOrExpressAirRate(rate: MarketplaceCheckoutRateQuote): boolean {
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

/** Rates a buyer may be offered at checkout given seller rules + optional custom allowlist. */
export function marketplaceOfferableRates(
  rates: MarketplaceCheckoutRateQuote[],
  scope: MarketplaceShippingOfferScope,
  allowedKeys: string[],
): MarketplaceCheckoutRateQuote[] {
  if (rates.length === 0) return [];
  let list = rates;
  if (scope === "no_overnight") {
    list = list.filter((r) => !isLikelyOvernightOrExpressAirRate(r));
  }
  if (scope === "custom") {
    const normalizedAllowed = allowedKeys
      .map((key) => {
        const [carrier = "", service = ""] = key.split("|");
        return marketplaceListingRateKey({ carrier, serviceLevel: service });
      })
      .filter(Boolean);
    if (normalizedAllowed.length === 0) return cheapestRatePerCarrier(list);
    const set = new Set(normalizedAllowed);
    list = list.filter((r) => set.has(marketplaceListingRateKey(r)));
    if (list.length === 0) {
      const allowedCarriers = new Set(
        normalizedAllowed.map((key) => key.split("|")[0]?.trim()).filter(Boolean),
      );
      if (allowedCarriers.size > 0) {
        list = rates.filter((r) => allowedCarriers.has(normalizeMarketplaceRateKeyPart(r.carrier)));
      }
    }
  }
  return cheapestRatePerCarrier(list);
}

/** One buyer-facing option per carrier — cheapest service in each lane. */
export function cheapestRatePerCarrier(rates: MarketplaceCheckoutRateQuote[]): MarketplaceCheckoutRateQuote[] {
  const byCarrier = new Map<string, MarketplaceCheckoutRateQuote>();
  for (const rate of rates) {
    const carrierKey = normalizeMarketplaceRateKeyPart(rate.carrier);
    const prev = byCarrier.get(carrierKey);
    if (!prev || Number(rate.amount) < Number(prev.amount)) {
      byCarrier.set(carrierKey, rate);
    }
  }
  return [...byCarrier.values()].sort((a, b) => Number(a.amount) - Number(b.amount));
}

export function parseMarketplaceShippingOfferScope(v: unknown): MarketplaceShippingOfferScope {
  if (v === "all" || v === "no_overnight" || v === "custom") return v;
  return "all";
}

export function parseMarketplaceAllowedRateKeys(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((k): k is string => typeof k === "string")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 40);
}

/** Match a buyer-selected rate across fresh Shippo quotes (ids are stable carrier|service keys). */
export function pickMarketplaceCheckoutRate(
  rates: MarketplaceCheckoutRateQuote[],
  selectedRateId: string,
): MarketplaceCheckoutRateQuote | null {
  const id = selectedRateId.trim();
  if (!id || rates.length === 0) return null;

  const exact = rates.find((r) => r.id === id);
  if (exact) return exact;

  const byLane = rates.filter((r) => marketplaceListingRateKey(r) === id);
  if (byLane.length === 1) return byLane[0]!;
  if (byLane.length > 1) {
    return [...byLane].sort((a, b) => Number(a.amount) - Number(b.amount))[0] ?? null;
  }

  // Legacy ephemeral Shippo rate ids from an earlier quote in the same session.
  if (!id.includes("|") && rates.length === 1) return rates[0]!;

  return null;
}
