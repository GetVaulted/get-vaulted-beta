import { describe, expect, it } from "vitest";
import { resolveLiveAuctionHammerUsd } from "@/lib/live-auction-item-sold-settle";

describe("resolveLiveAuctionHammerUsd", () => {
  it("prefers live room high bid over listing snapshot", () => {
    expect(
      resolveLiveAuctionHammerUsd({
        liveRoomItemHighUsd: 10,
        listingCurrentBidUsd: 9.99,
        proxyDisplayUsd: 9.99,
      }),
    ).toBe(10);
  });

  it("rounds float drift on the live high bid", () => {
    expect(
      resolveLiveAuctionHammerUsd({
        liveRoomItemHighUsd: 9.999999999999,
        listingCurrentBidUsd: 9.99,
        proxyDisplayUsd: 9.99,
      }),
    ).toBe(10);
  });

  it("falls back to listing then proxy display", () => {
    expect(
      resolveLiveAuctionHammerUsd({
        liveRoomItemHighUsd: null,
        listingCurrentBidUsd: 8,
        proxyDisplayUsd: 7.99,
      }),
    ).toBe(8);
    expect(
      resolveLiveAuctionHammerUsd({
        liveRoomItemHighUsd: null,
        listingCurrentBidUsd: null,
        proxyDisplayUsd: 7.99,
      }),
    ).toBe(7.99);
  });
});
