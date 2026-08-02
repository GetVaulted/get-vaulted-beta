import { describe, expect, it } from "vitest";
import { summarizeVariantSpots, allVariantSpotsSold, variantIsAvailable } from "@/lib/live-item-variant-presets";

describe("removed team spots", () => {
  it("excludes removed teams from sold and available counts", () => {
    const summary = summarizeVariantSpots([
      { priceUsd: 25, quantityRemaining: 1, soldCount: 0, status: "available" },
      { priceUsd: 25, quantityRemaining: 0, soldCount: 1, status: "sold_out" },
      { priceUsd: 25, quantityRemaining: 0, soldCount: 0, status: "removed" },
    ]);
    expect(summary.available).toBe(1);
    expect(summary.sold).toBe(1);
    expect(summary.spotCount).toBe(2);
  });

  it("treats removed as not available and not blocking break-ready with other sold spots", () => {
    expect(variantIsAvailable({ quantityRemaining: 0, status: "removed" })).toBe(false);
    expect(
      allVariantSpotsSold([
        { priceUsd: 10, quantityRemaining: 0, soldCount: 1, status: "sold_out" },
        { priceUsd: 10, quantityRemaining: 0, soldCount: 0, status: "removed" },
      ]),
    ).toBe(true);
  });
});
