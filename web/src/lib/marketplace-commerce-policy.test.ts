import { describe, expect, it } from "vitest";
import {
  isLegacyMarketplaceTimedAuction,
  isLiveShowInventoryDraft,
  isMarketplaceTimedAuctionPublishAttempt,
  PUBLIC_MARKETPLACE_LISTING_WHERE,
} from "@/lib/marketplace-commerce-policy";
import { LIVE_SHOW_INVENTORY_MARKER } from "@/lib/listing-inventory-channel";

describe("marketplace-commerce-policy", () => {
  it("blocks marketplace timed auction publish attempts", () => {
    expect(
      isMarketplaceTimedAuctionPublishAttempt({ buyingFormat: "auction", status: "auction_live" }),
    ).toBe(true);
    expect(
      isMarketplaceTimedAuctionPublishAttempt({ buyingFormat: "auction", status: "active" }),
    ).toBe(true);
    expect(
      isMarketplaceTimedAuctionPublishAttempt({ buyingFormat: "auction", status: "draft" }),
    ).toBe(false);
    expect(
      isMarketplaceTimedAuctionPublishAttempt({ buyingFormat: "buy_now", status: "active" }),
    ).toBe(false);
  });

  it("distinguishes legacy marketplace auctions from live show inventory drafts", () => {
    expect(isLegacyMarketplaceTimedAuction({ buyingFormat: "auction", status: "auction_live" })).toBe(
      true,
    );
    expect(isLiveShowInventoryDraft({ buyingFormat: "auction", status: "draft" })).toBe(true);
    expect(isLegacyMarketplaceTimedAuction({ buyingFormat: "auction", status: "draft" })).toBe(
      false,
    );
  });

  it("excludes live_show checkout listings from the public marketplace browse where", () => {
    expect(PUBLIC_MARKETPLACE_LISTING_WHERE.description).toEqual({
      not: { contains: LIVE_SHOW_INVENTORY_MARKER },
    });
  });
});
