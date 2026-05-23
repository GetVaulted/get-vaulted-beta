import { describe, expect, it } from "vitest";
import {
  isLegacyMarketplaceTimedAuction,
  isLiveShowInventoryDraft,
  isMarketplaceTimedAuctionPublishAttempt,
} from "@/lib/marketplace-commerce-policy";

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
});
