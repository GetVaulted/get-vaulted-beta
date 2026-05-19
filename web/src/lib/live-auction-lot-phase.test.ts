import { describe, expect, it } from "vitest";
import {
  LIVE_AUCTION_BUYER_TIMER_ENDED_COPY,
  LIVE_AUCTION_HOST_TIMER_ENDED_COPY,
  resolveLiveAuctionLotBidPhase,
} from "@/lib/live-auction-lot-phase";

describe("resolveLiveAuctionLotBidPhase", () => {
  const now = 1_000_000_000_000;

  it("returns not_started when active but bidding not open", () => {
    expect(
      resolveLiveAuctionLotBidPhase(
        { status: "active", biddingOpen: false, auctionEndsAt: null },
        now,
      ),
    ).toBe("not_started");
  });

  it("returns bidding_open inside timed window", () => {
    const ends = new Date(now + 30_000).toISOString();
    expect(
      resolveLiveAuctionLotBidPhase({ status: "active", biddingOpen: true, auctionEndsAt: ends }, now),
    ).toBe("bidding_open");
  });

  it("returns timer_ended_unsettled after grace (no auto-settle)", () => {
    const ends = new Date(now - 5_000).toISOString();
    expect(
      resolveLiveAuctionLotBidPhase({ status: "active", biddingOpen: true, auctionEndsAt: ends }, now),
    ).toBe("timer_ended_unsettled");
  });

  it("returns settled when item sold", () => {
    expect(resolveLiveAuctionLotBidPhase({ status: "sold", biddingOpen: false }, now)).toBe("settled");
  });

  it("exposes beta guardrail copy constants", () => {
    expect(LIVE_AUCTION_HOST_TIMER_ENDED_COPY).toContain("mark sold");
    expect(LIVE_AUCTION_BUYER_TIMER_ENDED_COPY).not.toMatch(/payment complete|auto/i);
  });
});
