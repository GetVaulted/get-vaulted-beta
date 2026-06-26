import { describe, expect, it } from "vitest";
import {
  formatAuctionLeaderLine,
  formatLiveWinnerAnnouncement,
  parsePurchaseCompletedCelebration,
} from "./live-auction-winner-display";

describe("live-auction-winner-display", () => {
  it("shows winning handle when username is present", () => {
    expect(
      formatAuctionLeaderLine({ lastHighBidderUsername: "card_king", lastHighBidderId: "u1", currentBidUsd: 42 }),
    ).toBe("Winning: @card_king");
  });

  it("shows opening bid when no bidder yet", () => {
    expect(formatAuctionLeaderLine({ startingBidUsd: 1 })).toBe("Opening bid $1");
    expect(formatAuctionLeaderLine({})).toBe("Opening bid $1");
  });

  it("formats room-wide winner announcement", () => {
    expect(formatLiveWinnerAnnouncement("vaultking", "Prizm Blaster")).toBe("@vaultking won (Prizm Blaster)");
  });

  it("parses sold and no-bid celebration payloads", () => {
    expect(
      parsePurchaseCompletedCelebration(
        {
          itemId: "item-1",
          winnerUsername: "vault_fan",
          winningAmountUsd: 55,
          winnerId: "user-winner",
        },
        "user-winner",
      ),
    ).toEqual({
      kind: "sold",
      itemId: "item-1",
      winnerUsername: "vault_fan",
      winningAmountUsd: 55,
      winnerId: "user-winner",
      viewerIsWinner: true,
      itemTitle: null,
    });

    expect(
      parsePurchaseCompletedCelebration(
        {
          itemId: "item-1",
          winnerUsername: "vault_fan",
          winningAmountUsd: 55,
          winnerId: "user-winner",
        },
        "user-loser",
      ),
    ).toEqual({
      kind: "sold",
      itemId: "item-1",
      winnerUsername: "vault_fan",
      winningAmountUsd: 55,
      winnerId: "user-winner",
      viewerIsWinner: false,
      itemTitle: null,
    });

    expect(parsePurchaseCompletedCelebration({ itemId: "item-2", noBids: true })).toEqual({
      kind: "no_bids",
      itemId: "item-2",
    });
  });
});
