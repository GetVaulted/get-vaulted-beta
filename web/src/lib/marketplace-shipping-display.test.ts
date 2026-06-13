import { describe, expect, it } from "vitest";
import {
  formatShippingRateRangeDisplay,
  normalizeHandlingEstimate,
  usesCarrierCalculatedShipping,
} from "@/lib/marketplace-shipping-display";

describe("marketplace-shipping-display", () => {
  it("formats a sorted low–high Shippo range", () => {
    const display = formatShippingRateRangeDisplay([
      {
        id: "ups-ground",
        carrier: "UPS",
        serviceLevel: "Ground",
        estimatedDelivery: "3 days",
        estimatedDays: 3,
        amount: "12.65",
        currency: "USD",
        trackingIncluded: true,
        insuranceAvailable: true,
      },
      {
        id: "usps-ga",
        carrier: "USPS",
        serviceLevel: "Ground Advantage",
        estimatedDelivery: "5 days",
        estimatedDays: 5,
        amount: "8.42",
        currency: "USD",
        trackingIncluded: true,
        insuranceAvailable: true,
      },
    ]);
    expect(display).toBe("$8.42 – $12.65");
  });

  it("treats zero flat shipping as carrier-calculated", () => {
    expect(usesCarrierCalculatedShipping(0)).toBe(true);
    expect(usesCarrierCalculatedShipping(12.5)).toBe(false);
  });

  it("normalizes placeholder handling labels", () => {
    expect(normalizeHandlingEstimate("—")).toBe("Typically ships within 1–2 business days");
  });
});
