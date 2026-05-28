import { describe, expect, it } from "vitest";
import {
  computeLiveRoomEnergy,
  countRecentBids,
  isBidWar,
  pushBidTimestamp,
} from "@/lib/live-room-energy";

describe("computeLiveRoomEnergy", () => {
  it("returns calm score for empty room", () => {
    const { score, level } = computeLiveRoomEnergy({
      viewerCount: 0,
      recentMessageCount: 0,
      bidsLastMinute: 0,
      auctionLive: false,
    });
    expect(score).toBe(0);
    expect(level).toBe("calm");
  });

  it("ramps with viewers, chat, and bids", () => {
    const { score, level } = computeLiveRoomEnergy({
      viewerCount: 12,
      recentMessageCount: 8,
      bidsLastMinute: 4,
      auctionLive: true,
    });
    expect(score).toBeGreaterThan(50);
    expect(level).toMatch(/hot|electric/);
  });
});

describe("bid timestamp helpers", () => {
  it("tracks bids in rolling window", () => {
    const t0 = 1_000_000;
    let ts = pushBidTimestamp([], t0);
    ts = pushBidTimestamp(ts, t0 + 5_000);
    expect(countRecentBids(ts, t0 + 5_000)).toBe(2);
    expect(countRecentBids(ts, t0 + 70_000)).toBe(0);
  });

  it("detects bid war", () => {
    const t0 = 2_000_000;
    let ts: number[] = [];
    ts = pushBidTimestamp(ts, t0);
    ts = pushBidTimestamp(ts, t0 + 1_000);
    ts = pushBidTimestamp(ts, t0 + 2_500);
    expect(isBidWar(ts, t0 + 3_000)).toBe(true);
  });
});
