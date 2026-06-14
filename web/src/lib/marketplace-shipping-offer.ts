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

export const MARKETPLACE_CARRIER_LABELS: Record<string, string> = {
  usps: "USPS",
  ups: "UPS",
  fedex: "FedEx",
  dhl: "DHL",
};

function normalizeMarketplaceRateKeyPart(value: string): string {
  return value.trim().toLowerCase();
}

/** Map Shippo provider names to stable carrier keys for allowlists. */
export function normalizeMarketplaceCarrierKey(carrier: string): string {
  const raw = carrier.trim().toLowerCase();
  if (!raw) return "unknown";
  if (raw.includes("usps") || raw.includes("postal")) return "usps";
  if (raw.includes("fedex") || raw.includes("fed ex")) return "fedex";
  if (raw === "ups" || raw.startsWith("ups ") || raw.includes("united parcel")) return "ups";
  if (raw.includes("dhl")) return "dhl";
  return raw.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "unknown";
}

export function marketplaceCarrierLabel(key: string): string {
  const normalized = normalizeMarketplaceCarrierKey(key);
  return MARKETPLACE_CARRIER_LABELS[normalized] ?? key.trim().toUpperCase();
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

/** Rates a buyer may be offered at checkout given seller rules + carrier allowlist. */
export function marketplaceOfferableRates(
  rates: MarketplaceCheckoutRateQuote[],
  scope: MarketplaceShippingOfferScope,
  allowedKeys: string[],
  allowedCarriers: string[] = [],
): MarketplaceCheckoutRateQuote[] {
  if (rates.length === 0) return [];
  let list = rates;

  if (allowedCarriers.length > 0) {
    const carrierSet = new Set(allowedCarriers.map(normalizeMarketplaceCarrierKey));
    list = list.filter((r) => carrierSet.has(normalizeMarketplaceCarrierKey(r.carrier)));
  }

  if (scope === "no_overnight") {
    list = list.filter((r) => !isLikelyOvernightOrExpressAirRate(r));
  }

  if (scope === "custom" && allowedKeys.length > 0) {
    const normalizedAllowed = allowedKeys
      .map((key) => {
        const [carrier = "", service = ""] = key.split("|");
        return marketplaceListingRateKey({ carrier, serviceLevel: service });
      })
      .filter(Boolean);
    const set = new Set(normalizedAllowed);
    list = list.filter((r) => set.has(marketplaceListingRateKey(r)));
    if (list.length === 0 && allowedCarriers.length === 0) {
      const allowedCarrierKeys = new Set(
        normalizedAllowed.map((key) => key.split("|")[0]?.trim()).filter(Boolean),
      );
      if (allowedCarrierKeys.size > 0) {
        list = rates.filter((r) => allowedCarrierKeys.has(normalizeMarketplaceRateKeyPart(r.carrier)));
      }
    }
  }

  return cheapestRatePerCarrier(list);
}

/** One buyer-facing option per carrier — cheapest service in each lane. */
export function cheapestRatePerCarrier(rates: MarketplaceCheckoutRateQuote[]): MarketplaceCheckoutRateQuote[] {
  const byCarrier = new Map<string, MarketplaceCheckoutRateQuote>();
  for (const rate of rates) {
    const carrierKey = normalizeMarketplaceCarrierKey(rate.carrier);
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

export function parseMarketplaceAllowedCarriers(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const canonical = new Set<string>();
  for (const item of v) {
    if (typeof item !== "string") continue;
    const key = normalizeMarketplaceCarrierKey(item);
    if (key !== "unknown") canonical.add(key);
  }
  return [...canonical].slice(0, 8);
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
