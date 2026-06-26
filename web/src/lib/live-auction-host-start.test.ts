import { describe, expect, it } from "vitest";
import {
  canHostStartLiveAuction,
  isMultiQuantityLiveAuctionItem,
  liveAuctionHasPendingWinner,
  liveAuctionUnitsRemaining,
} from "@/lib/live-auction-host-start";

const multiActive = {
  title: "10x Slabs",
  quantity: 8,
  quantityInitial: 10,
  status: "active",
  lastHighBidderId: null,
  biddingOpen: false,
  auctionEndsAt: null,
};

describe("live-auction-host-start", () => {
  it("detects multi-quantity lots", () => {
    expect(isMultiQuantityLiveAuctionItem({ quantity: 10, quantityInitial: 10 })).toBe(true);
    expect(isMultiQuantityLiveAuctionItem({ quantity: 1, quantityInitial: 1 })).toBe(false);
  });

  it("tracks remaining units from quantity fields", () => {
    expect(liveAuctionUnitsRemaining(multiActive)).toBe(8);
  });

  it("allows start after no-bid timer end on multi-qty active lot", () => {
    const endedNoBids = {
      ...multiActive,
      auctionEndsAt: new Date(Date.now() - 5000).toISOString(),
      biddingOpen: true,
    };
    expect(
      canHostStartLiveAuction(endedNoBids, {
        roomLive: true,
        lotBidPhase: "timer_ended_unsettled",
      }),
    ).toBe(true);
  });

  it("blocks start while bidding is open", () => {
    expect(
      canHostStartLiveAuction(
        { ...multiActive, biddingOpen: true, auctionEndsAt: new Date(Date.now() + 5000).toISOString() },
        { roomLive: true, lotBidPhase: "bidding_open" },
      ),
    ).toBe(false);
  });

  it("blocks start while winner awaits mark sold", () => {
    expect(
      liveAuctionHasPendingWinner(
        { lastHighBidderId: "user-1" },
        "timer_ended_unsettled",
      ),
    ).toBe(true);
    expect(
      canHostStartLiveAuction(
        { ...multiActive, lastHighBidderId: "user-1", auctionEndsAt: new Date(Date.now() - 5000).toISOString() },
        { roomLive: true, lotBidPhase: "timer_ended_unsettled" },
      ),
    ).toBe(false);
  });

  it("blocks start when sold out", () => {
    expect(
      canHostStartLiveAuction(
        { ...multiActive, quantity: 0, status: "sold" },
        { roomLive: true, lotBidPhase: "not_started" },
      ),
    ).toBe(false);
  });
});
