import { describe, expect, it } from "vitest";
import {
  parseAuctionWinSpotCelebration,
  parseVariantPurchasedCelebration,
  spotCelebrationHeadline,
} from "./live-spot-celebration";

describe("live-spot-celebration", () => {
  it("parses variant purchase payload", () => {
    expect(
      parseVariantPurchasedCelebration({
        label: "Arizona Cardinals",
        buyerUsername: "buyer1",
        amountUsd: 45,
      }),
    ).toEqual({
      username: "buyer1",
      label: "Arizona Cardinals",
      amountUsd: 45,
      kind: "purchase",
    });
  });

  it("parses auction win payload", () => {
    expect(
      parseAuctionWinSpotCelebration({
        winnerUsername: "winner42",
        winningAmountUsd: 1,
        itemTitle: "NFC East",
      }),
    ).toEqual({
      username: "winner42",
      label: "NFC East",
      amountUsd: 1,
      kind: "auction_win",
    });
  });

  it("headline reflects kind", () => {
    expect(spotCelebrationHeadline("purchase")).toBe("TAKEN!");
    expect(spotCelebrationHeadline("auction_win")).toBe("SOLD!");
  });
});
