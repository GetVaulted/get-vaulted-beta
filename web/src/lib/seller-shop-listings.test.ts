import { describe, expect, it } from "vitest";
import { parseSellerShopTab, sellerShopListingWhere } from "./seller-shop-listings";

describe("parseSellerShopTab", () => {
  it("defaults to all", () => {
    expect(parseSellerShopTab(undefined)).toBe("all");
    expect(parseSellerShopTab("")).toBe("all");
    expect(parseSellerShopTab("nope")).toBe("all");
  });

  it("parses known tabs", () => {
    expect(parseSellerShopTab("buy_now")).toBe("buy_now");
    expect(parseSellerShopTab("auctions")).toBe("auctions");
    expect(parseSellerShopTab("sold")).toBe("sold");
  });
});

describe("sellerShopListingWhere", () => {
  const sellerId = "seller_1";

  it("filters sold listings", () => {
    expect(sellerShopListingWhere(sellerId, "sold")).toEqual({ sellerId, status: "sold" });
  });

  it("filters buy now active listings", () => {
    expect(sellerShopListingWhere(sellerId, "buy_now")).toEqual({
      sellerId,
      status: "active",
      buyingFormat: "buy_now",
      moderationRemovedAt: null,
    });
  });

  it("filters auction listings", () => {
    expect(sellerShopListingWhere(sellerId, "auctions")).toEqual({
      sellerId,
      moderationRemovedAt: null,
      OR: [{ status: "auction_live" }, { status: "active", buyingFormat: "auction" }],
    });
  });
});
