import { describe, expect, it } from "vitest";
import {
  marketplaceListingRateKey,
  marketplaceOfferableRates,
  pickMarketplaceCheckoutRate,
} from "@/lib/marketplace-shipping-offer";

const rates = [
  {
    id: "1",
    carrier: "USPS",
    serviceLevel: "Ground Advantage",
    estimatedDelivery: "3-5 days",
    estimatedDays: 5,
    amount: "8.00",
    currency: "USD",
    trackingIncluded: true,
    insuranceAvailable: false,
  },
  {
    id: "2",
    carrier: "FedEx",
    serviceLevel: "Standard Overnight",
    estimatedDelivery: "overnight",
    estimatedDays: 1,
    amount: "24.00",
    currency: "USD",
    trackingIncluded: true,
    insuranceAvailable: false,
  },
];

describe("marketplaceOfferableRates", () => {
  it("filters overnight when scope is no_overnight", () => {
    const out = marketplaceOfferableRates(rates, "no_overnight", []);
    expect(out.map((r) => r.id)).toEqual(["1"]);
  });

  it("filters to custom allowlist keys", () => {
    const key = marketplaceListingRateKey(rates[1]!);
    const out = marketplaceOfferableRates(rates, "custom", [key]);
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });

  it("matches custom allowlist keys case-insensitively", () => {
    const out = marketplaceOfferableRates(rates, "custom", ["fedex|standard overnight"]);
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });

  it("returns all rates when custom allowlist is empty", () => {
    const out = marketplaceOfferableRates(rates, "custom", []);
    expect(out).toHaveLength(2);
  });
});

describe("pickMarketplaceCheckoutRate", () => {
  const quoted = rates.map((r) => ({ ...r, id: marketplaceListingRateKey(r) }));

  it("matches stable carrier|service ids across re-quotes", () => {
    const selected = marketplaceListingRateKey(quoted[0]!);
    const refreshed = [{ ...quoted[0]!, amount: "8.55" }];
    const picked = pickMarketplaceCheckoutRate(refreshed, selected);
    expect(picked?.amount).toBe("8.55");
  });

  it("returns null for stale Shippo object ids when multiple rates exist", () => {
    expect(pickMarketplaceCheckoutRate(quoted, "shippo_rate_object_abc")).toBeNull();
  });

  it("accepts legacy Shippo ids when only one rate is offered", () => {
    const only = [quoted[0]!];
    expect(pickMarketplaceCheckoutRate(only, "shippo_rate_object_abc")).toEqual(only[0]);
  });
});
