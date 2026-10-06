import { describe, expect, it } from "vitest";
import { LIVE_SHOW_INVENTORY_MARKER } from "@/lib/listing-inventory-channel";
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
  const notLiveShow = { description: { not: { contains: LIVE_SHOW_INVENTORY_MARKER } } };

  it("filters sold listings and leaves live-show spot rows out", () => {
    expect(sellerShopListingWhere(sellerId, "sold")).toEqual({ sellerId, status: "sold", ...notLiveShow });
  });

  it("filters buy now active listings", () => {
    expect(sellerShopListingWhere(sellerId, "buy_now")).toEqual({
      sellerId,
      status: "active",
      buyingFormat: "buy_now",
      moderationRemovedAt: null,
      ...notLiveShow,
    });
  });

  it("filters auction listings", () => {
    expect(sellerShopListingWhere(sellerId, "auctions")).toEqual({
      sellerId,
      moderationRemovedAt: null,
      ...notLiveShow,
      OR: [{ status: "auction_live" }, { status: "active", buyingFormat: "auction" }],
    });
  });
});
