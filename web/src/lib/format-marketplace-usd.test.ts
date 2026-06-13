import { describe, expect, it } from "vitest";
import { formatMarketplaceUsd } from "@/lib/format-marketplace-usd";

describe("formatMarketplaceUsd", () => {
  it("shows cents for fractional listing prices", () => {
    expect(formatMarketplaceUsd(799.99)).toBe("$799.99");
    expect(formatMarketplaceUsd(95.5)).toBe("$95.50");
  });

  it("omits cents for whole-dollar listing prices", () => {
    expect(formatMarketplaceUsd(800)).toBe("$800");
    expect(formatMarketplaceUsd(500)).toBe("$500");
  });
});
