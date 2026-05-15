import { describe, expect, it, vi } from "vitest";
import {
  calculateLiveShippingCost,
  computeBundledNextItemShippingDeltaCents,
  liveShippingTierLabelForPricingWeightOz,
} from "@/services/shipping/live-shipping-pricing";

describe("liveShippingTierLabelForPricingWeightOz", () => {
  it("labels low tiers", () => {
    expect(liveShippingTierLabelForPricingWeightOz(1)).toBe("1–4 oz tier");
    expect(liveShippingTierLabelForPricingWeightOz(4)).toBe("1–4 oz tier");
    expect(liveShippingTierLabelForPricingWeightOz(5)).toBe("5–8 oz tier");
    expect(liveShippingTierLabelForPricingWeightOz(8)).toBe("5–8 oz tier");
  });

  it("returns null for non-positive weight", () => {
    expect(liveShippingTierLabelForPricingWeightOz(0)).toBeNull();
    expect(liveShippingTierLabelForPricingWeightOz(-1)).toBeNull();
  });
});

describe("computeBundledNextItemShippingDeltaCents", () => {
  it("returns delta when next item crosses a tier", () => {
    const delta = computeBundledNextItemShippingDeltaCents({
      currentPricingWeightOz: 4,
      currentShippingCostCents: 399,
      capReached: false,
      incrementalWeightOz: 1,
      listingCapCents: null,
    });
    expect(delta).toBe(100);
    expect(calculateLiveShippingCost(5, null)).toBe(499);
  });

  it("returns 0 when already capped", () => {
    expect(
      computeBundledNextItemShippingDeltaCents({
        currentPricingWeightOz: 40,
        currentShippingCostCents: 1199,
        capReached: true,
        incrementalWeightOz: 3,
        listingCapCents: 1199,
      }),
    ).toBe(0);
  });

  it("returns null when incremental weight invalid", () => {
    expect(
      computeBundledNextItemShippingDeltaCents({
        currentPricingWeightOz: 4,
        currentShippingCostCents: 399,
        capReached: false,
        incrementalWeightOz: 0,
        listingCapCents: null,
      }),
    ).toBeNull();
  });

  it("respects LIVE_SHIPPING_TIERS_JSON when set", () => {
    vi.stubEnv(
      "LIVE_SHIPPING_TIERS_JSON",
      JSON.stringify([
        { maxWeightOz: 2, costCents: 200 },
        { maxWeightOz: 4, costCents: 400 },
        { maxWeightOz: 100, costCents: 900 },
      ]),
    );
    try {
      const delta = computeBundledNextItemShippingDeltaCents({
        currentPricingWeightOz: 2,
        currentShippingCostCents: 200,
        capReached: false,
        incrementalWeightOz: 1,
        listingCapCents: null,
      });
      expect(delta).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
