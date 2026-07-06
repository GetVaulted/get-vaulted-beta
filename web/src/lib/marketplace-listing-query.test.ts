import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_BROWSE_DEFAULT_PAGE_SIZE,
  MARKETPLACE_BROWSE_MAX_PAGE_SIZE,
  buildMarketplaceBrowseOrderBy,
  buildMarketplaceBrowseWhere,
  parseMarketplaceBrowseQueryParams,
} from "@/lib/marketplace-listing-query";

describe("parseMarketplaceBrowseQueryParams", () => {
  it("applies defaults when no params are given", () => {
    const parsed = parseMarketplaceBrowseQueryParams(new URLSearchParams());
    expect(parsed).toEqual({
      q: "",
      category: "All",
      priceMin: null,
      priceMax: null,
      condition: "Any",
      sort: "recent",
      page: 1,
      pageSize: MARKETPLACE_BROWSE_DEFAULT_PAGE_SIZE,
    });
  });

  it("parses and clamps valid params", () => {
    const parsed = parseMarketplaceBrowseQueryParams(
      new URLSearchParams({
        q: "  charizard  ",
        category: "Trading Cards",
        priceMin: "50",
        priceMax: "500",
        condition: "PSA 10",
        sort: "price-asc",
        page: "3",
        pageSize: "40",
      }),
    );
    expect(parsed).toEqual({
      q: "charizard",
      category: "Trading Cards",
      priceMin: 50,
      priceMax: 500,
      condition: "PSA 10",
      sort: "price-asc",
      page: 3,
      pageSize: 40,
    });
  });

  it("falls back to defaults for invalid/unrecognized enum-like params", () => {
    const parsed = parseMarketplaceBrowseQueryParams(
      new URLSearchParams({ category: "Not A Real Category", sort: "random-nonsense", priceMin: "-5" }),
    );
    expect(parsed.category).toBe("All");
    expect(parsed.sort).toBe("recent");
    expect(parsed.priceMin).toBeNull();
  });

  it("clamps pageSize to the configured max and page to at least 1", () => {
    const parsed = parseMarketplaceBrowseQueryParams(
      new URLSearchParams({ pageSize: "999999", page: "0" }),
    );
    expect(parsed.pageSize).toBe(MARKETPLACE_BROWSE_MAX_PAGE_SIZE);
    expect(parsed.page).toBe(1);
  });
});

describe("buildMarketplaceBrowseWhere", () => {
  const base = { q: "", category: "All" as const, priceMin: null, priceMax: null, condition: "Any" };

  it("includes only the base public-marketplace scope when no filters are set", () => {
    const where = buildMarketplaceBrowseWhere(base);
    expect(where.status).toBe("active");
    expect(where.buyingFormat).toBe("buy_now");
    expect(where.category).toBeUndefined();
    expect(where.condition).toBeUndefined();
    expect(where.priceUsd).toBeUndefined();
    expect(where.OR).toBeUndefined();
  });

  it("adds category/condition/price filters when set", () => {
    const where = buildMarketplaceBrowseWhere({
      ...base,
      category: "Watches",
      condition: "Unworn",
      priceMin: 100,
      priceMax: 900,
    });
    expect(where.category).toBe("Watches");
    expect(where.condition).toBe("Unworn");
    expect(where.priceUsd).toEqual({ gte: 100, lte: 900 });
  });

  it("adds a case-insensitive title/seller search OR clause", () => {
    const where = buildMarketplaceBrowseWhere({ ...base, q: "Mantle" });
    expect(where.OR).toEqual([
      { title: { contains: "Mantle", mode: "insensitive" } },
      { seller: { username: { contains: "Mantle", mode: "insensitive" } } },
    ]);
  });

  it("only sets one side of the price range when the other is omitted", () => {
    const whereMinOnly = buildMarketplaceBrowseWhere({ ...base, priceMin: 25, priceMax: null });
    expect(whereMinOnly.priceUsd).toEqual({ gte: 25 });

    const whereMaxOnly = buildMarketplaceBrowseWhere({ ...base, priceMin: null, priceMax: 25 });
    expect(whereMaxOnly.priceUsd).toEqual({ lte: 25 });
  });
});

describe("buildMarketplaceBrowseOrderBy", () => {
  it("sorts by createdAt desc for 'recent'", () => {
    expect(buildMarketplaceBrowseOrderBy("recent")).toEqual([{ createdAt: "desc" }]);
  });

  it("sorts by priceUsd asc/desc with a createdAt tiebreaker", () => {
    expect(buildMarketplaceBrowseOrderBy("price-asc")).toEqual([
      { priceUsd: "asc" },
      { createdAt: "desc" },
    ]);
    expect(buildMarketplaceBrowseOrderBy("price-desc")).toEqual([
      { priceUsd: "desc" },
      { createdAt: "desc" },
    ]);
  });

  it("sorts by seller level desc (enum order ranks elite highest)", () => {
    expect(buildMarketplaceBrowseOrderBy("seller-level")).toEqual([
      { seller: { sellerLevel: "desc" } },
      { createdAt: "desc" },
    ]);
  });
});
