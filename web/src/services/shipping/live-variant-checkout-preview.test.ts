import { describe, expect, it } from "vitest";
import { bundledLiveShippingTotalCentsAfterWin } from "@/services/shipping/live-variant-checkout-preview";
import type { BuyerLiveShippingSessionApi } from "@/services/shipping/buyer-live-shipping-ux";

function session(partial: Partial<BuyerLiveShippingSessionApi>): BuyerLiveShippingSessionApi {
  return {
    shippingCostCents: 0,
    pricingWeightOz: 0,
    capReached: false,
    nextIncrementalCostCents: null,
    tierLabel: null,
    shippingCapCents: 999,
    freeShippingEnabled: false,
    shippingMode: "capped",
    showShippingHudCopy: "",
    packageCount: 0,
    previewWinDeltaCents: null,
    previewRequiresSeparatePackage: false,
    ...partial,
  };
}

describe("bundledLiveShippingTotalCentsAfterWin", () => {
  it("returns zero for free shipping shows", () => {
    expect(
      bundledLiveShippingTotalCentsAfterWin(
        session({ freeShippingEnabled: true, shippingMode: "free", previewWinDeltaCents: 499 }),
      ),
    ).toBe(0);
  });

  it("uses preview delta when buyer has no bundled packages yet", () => {
    expect(
      bundledLiveShippingTotalCentsAfterWin(
        session({ previewWinDeltaCents: 499, packageCount: 0, shippingCostCents: 0 }),
      ),
    ).toBe(499);
  });

  it("adds incremental delta to existing bundled shipping", () => {
    expect(
      bundledLiveShippingTotalCentsAfterWin(
        session({
          shippingCostCents: 300,
          previewWinDeltaCents: 200,
          packageCount: 1,
        }),
      ),
    ).toBe(500);
  });

  it("does not add delta after cap is reached", () => {
    expect(
      bundledLiveShippingTotalCentsAfterWin(
        session({
          shippingCostCents: 999,
          capReached: true,
          previewWinDeltaCents: 200,
          packageCount: 2,
        }),
      ),
    ).toBe(999);
  });
});

describe("getLiveVariantCheckoutPreview shipping display", () => {
  it("uses cap-reached free copy when show shipping cap is met", async () => {
    const { buyerLiveShippingPaidCopy } = await import("@/lib/live-show-shipping-terms");
    const capReachedCopy = buyerLiveShippingPaidCopy({
      mode: "capped",
      paidCents: 999,
      capCents: 999,
      capReached: true,
    });
    expect(capReachedCopy).toBe("Shipping cap reached — additional eligible wins ship free");
  });
});
