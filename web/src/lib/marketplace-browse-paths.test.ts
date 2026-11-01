import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_CATEGORY_PAGES,
  marketplaceCategoryBySlug,
  marketplaceCategoryPath,
  marketplacePagePath,
  parseMarketplacePageParam,
} from "@/lib/marketplace-browse-paths";

describe("marketplace crawlable paths", () => {
  it("gives every browse category a stable slug page", () => {
    expect(MARKETPLACE_CATEGORY_PAGES.map((c) => c.slug)).toEqual([
      "trading-cards",
      "memorabilia",
      "watches",
      "sneakers",
      "other",
      "helmets",
    ]);
    expect(marketplaceCategoryBySlug("trading-cards")?.category).toBe("Trading Cards");
    expect(marketplaceCategoryBySlug("nope")).toBeNull();
  });

  it("builds page URLs: page 1 has no ?page, later pages do", () => {
    expect(marketplaceCategoryPath("All")).toBe("/marketplace");
    expect(marketplacePagePath("All", 1)).toBe("/marketplace");
    expect(marketplacePagePath("All", 3)).toBe("/marketplace?page=3");
    expect(marketplacePagePath("Sneakers", 2)).toBe("/marketplace/category/sneakers?page=2");
  });

  it("parses ?page safely", () => {
    expect(parseMarketplacePageParam(undefined)).toBe(1);
    expect(parseMarketplacePageParam("4")).toBe(4);
    expect(parseMarketplacePageParam(["2", "9"])).toBe(2);
    for (const bad of ["0", "-3", "abc", ""]) expect(parseMarketplacePageParam(bad)).toBe(1);
    expect(parseMarketplacePageParam("999999999")).toBe(10_000);
  });
});
