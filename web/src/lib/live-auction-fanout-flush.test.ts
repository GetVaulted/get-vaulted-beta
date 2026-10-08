import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  emitBid: vi.fn(),
  emitActive: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { liveAuctionEvent: { findMany: hoisted.findMany, update: hoisted.update } },
}));
vi.mock("@/lib/realtime-emit-server", () => ({
  emitBidPlacedAwait: hoisted.emitBid,
  emitActiveItemChangedAwait: hoisted.emitActive,
}));
vi.mock("@/lib/live-auction-stream/sidecars", () => ({ scheduleCanonicalAuctionEventSidecars: vi.fn() }));
vi.mock("@/lib/live-auction-otel", () => ({
  runLiveAuctionSpan: (_n: string, _a: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/live-auction-rt-debug", () => ({ logLiveAuctionRtDebug: vi.fn() }));

import { flushPendingLiveAuctionFanout } from "@/lib/live-auction-fanout-flush";

function row(seq: number) {
  return {
    id: `e${seq}`,
    liveRoomId: "room1",
    seq,
    eventType: "bid_placed",
    payload: {
      v: 1,
      liveRoomId: "room1",
      itemId: "item1",
      amountUsd: seq,
      bidderId: "u1",
      listingId: null,
      roomVersion: seq,
      itemVersion: seq,
      auctionEndsAt: null,
      biddingOpen: true,
      leadingBidderId: "u1",
      leadingBidderUsername: "bob",
      clutchTimeEnabled: false,
      emitActiveItemChanged: false,
    },
  };
}

describe("flushPendingLiveAuctionFanout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.emitBid.mockResolvedValue(undefined);
    hoisted.emitActive.mockResolvedValue(undefined);
    hoisted.update.mockResolvedValue({});
  });

  it("broadcasts pending bids in seq order and marks each one sent", async () => {
    hoisted.findMany.mockResolvedValueOnce([row(1), row(2), row(3)]);
    const n = await flushPendingLiveAuctionFanout({ liveRoomId: "room1" });
    expect(n).toBe(3);
    expect(hoisted.emitBid.mock.calls.map((c) => c[0].auctionSeq)).toEqual([1, 2, 3]);
    expect(hoisted.update).toHaveBeenCalledTimes(3);
  });

  it("does not wait on a 'sent' write before broadcasting the next bid", async () => {
    const releases: Array<() => void> = [];
    hoisted.update.mockImplementation(() => new Promise<void>((r) => releases.push(r)));
    hoisted.findMany.mockResolvedValueOnce([row(1), row(2)]);
    const p = flushPendingLiveAuctionFanout({ liveRoomId: "room1" });
    await vi.waitFor(() => expect(hoisted.emitBid).toHaveBeenCalledTimes(2));
    releases.forEach((r) => r());
    await p;
  });

  it("two overlapping flushes for the same room never broadcast the same bid twice", async () => {
    const pending = [row(1)];
    hoisted.findMany.mockImplementation(async () => pending.slice());
    hoisted.update.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const i = pending.findIndex((r) => r.id === where.id);
      if (i >= 0) pending.splice(i, 1);
      return {};
    });
    await Promise.all([
      flushPendingLiveAuctionFanout({ liveRoomId: "room1" }),
      flushPendingLiveAuctionFanout({ liveRoomId: "room1" }),
    ]);
    expect(hoisted.emitBid).toHaveBeenCalledTimes(1);
  });
});
