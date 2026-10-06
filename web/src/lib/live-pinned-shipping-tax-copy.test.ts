import { describe, expect, it } from "vitest";
import {
  formatPinnedShippingLabel,
  formatPinnedTaxLabel,
  formatPinnedShippingTaxLine,
} from "../../../shared/live-pinned-shipping-tax-copy";

describe("live pinned shipping label", () => {
  it("shows the incremental shipping charge", () => {
    expect(formatPinnedShippingLabel("$3.99")).toBe("Shipping $3.99");
    expect(formatPinnedShippingLabel("$1.00")).toBe("Shipping $1.00");
  });

  it("says Free shipping once the cap is met / free show", () => {
    expect(formatPinnedShippingLabel("Free shipping")).toBe("Free shipping");
  });

  it("falls back when no shipping display is available", () => {
    expect(formatPinnedShippingLabel("")).toBe("Shipping at checkout");
    expect(formatPinnedShippingLabel(null)).toBe("Shipping at checkout");
  });
});

describe("live pinned tax label", () => {
  it("says Tax $0 when the buyer owes no tax", () => {
    expect(formatPinnedTaxLabel({ isAuction: false, taxApplies: false, taxUsd: 0 })).toBe("Tax $0");
    expect(formatPinnedTaxLabel({ isAuction: true, taxApplies: false, taxUsd: 0 })).toBe("Tax $0");
  });

  it("shows only + Tax for auctions (final price unknown)", () => {
    expect(formatPinnedTaxLabel({ isAuction: true, taxApplies: true, taxUsd: 4.5 })).toBe("+ Tax");
  });

  it("shows the computed tax amount for buy-it-now", () => {
    expect(formatPinnedTaxLabel({ isAuction: false, taxApplies: true, taxUsd: 4.5 })).toBe("Tax $4.50");
  });
});

describe("live pinned shipping + tax line", () => {
  it("composes shipping and tax per lot type", () => {
    expect(
      formatPinnedShippingTaxLine({ isAuction: true, shippingDisplay: "$3.99", taxApplies: true, taxUsd: 0 }),
    ).toBe("Shipping $3.99 · + Tax");
    expect(
      formatPinnedShippingTaxLine({ isAuction: false, shippingDisplay: "Free shipping", taxApplies: false, taxUsd: 0 }),
    ).toBe("Free shipping · Tax $0");
    expect(
      formatPinnedShippingTaxLine({ isAuction: false, shippingDisplay: "$2.00", taxApplies: true, taxUsd: 3.25 }),
    ).toBe("Shipping $2.00 · Tax $3.25");
  });
});
