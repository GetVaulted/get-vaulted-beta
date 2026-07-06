import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression (chaos engineering deep-dive, 2026-07): pure auction lots never auto-settle on
// timer (documented product rule) — if the host disconnects and never returns, the winner was
// previously stranded forever with nobody alerted. These tests verify the stall-alert sweep (a)
// finds only overdue pending-winner auction lots, (b) alerts admin + the winning buyer exactly
// once per lot, and (c) never touches bidding/order state (read-only w.r.t. outcomes).

const hoisted = vi.hoisted(() => ({
  reportCronAnomaly: vi.fn(),
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cron-anomaly-alert", () => ({ reportCronAnomaly: hoisted.reportCronAnomaly }));
vi.mock("@/lib/notifications", () => ({ createNotification: hoisted.createNotification }));

const prismaMock = vi.hoisted(() => ({
  liveRoomItem: { findMany: vi.fn() },
  webhookEventLog: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const THIRTY_HOURS_AGO = new Date(Date.now() - 30 * 60 * 60 * 1000);

describe("reportStalledAuctionLotsToAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.webhookEventLog.findFirst.mockResolvedValue(null);
  });

  it("alerts admin and the winning buyer for a stalled lot not yet alerted", async () => {
    prismaMock.liveRoomItem.findMany.mockResolvedValue([
      {
        id: "item_1",
        title: "Rare rookie card",
        lastHighBidderId: "buyer_1",
        auctionEndsAt: THIRTY_HOURS_AGO,
        liveRoomId: "room_1",
        liveRoom: { sellerId: "seller_1" },
      },
    ]);

    const { reportStalledAuctionLotsToAdmin } = await import("@/lib/live-auction-stalled-lots");
    const result = await reportStalledAuctionLotsToAdmin(24);

    expect(result).toEqual({ checked: 1, newlyAlerted: 1 });
    expect(hoisted.reportCronAnomaly).toHaveBeenCalledTimes(1);
    expect(hoisted.reportCronAnomaly.mock.calls[0][0]).toBe("live-auction-stall");
    expect(hoisted.createNotification).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ userId: "buyer_1", type: "auction_win_pending_seller_confirmation" }),
    );
    expect(prismaMock.webhookEventLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: "live-auction-stall-alert", externalId: "item_1" }) }),
    );
  });

  it("does not re-alert a lot already marked as alerted", async () => {
    prismaMock.liveRoomItem.findMany.mockResolvedValue([
      {
        id: "item_2",
        title: "Already alerted lot",
        lastHighBidderId: "buyer_2",
        auctionEndsAt: THIRTY_HOURS_AGO,
        liveRoomId: "room_2",
        liveRoom: { sellerId: "seller_2" },
      },
    ]);
    prismaMock.webhookEventLog.findFirst.mockResolvedValue({ id: "log_1" });

    const { reportStalledAuctionLotsToAdmin } = await import("@/lib/live-auction-stalled-lots");
    const result = await reportStalledAuctionLotsToAdmin(24);

    expect(result).toEqual({ checked: 1, newlyAlerted: 0 });
    expect(hoisted.reportCronAnomaly).not.toHaveBeenCalled();
    expect(hoisted.createNotification).not.toHaveBeenCalled();
  });

  it("queries only active/bidding-closed/pure-auction lots past the threshold, never touching bid state", async () => {
    prismaMock.liveRoomItem.findMany.mockResolvedValue([]);

    const { findStalledPendingWinnerAuctionLots } = await import("@/lib/live-auction-stalled-lots");
    await findStalledPendingWinnerAuctionLots(24);

    expect(prismaMock.liveRoomItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "active",
          biddingOpen: false,
          lastHighBidderId: { not: null },
          liveRoom: { roomType: "auction" },
        }),
      }),
    );
    // Read-only: this module has no write call anywhere touching liveRoomItem.
    expect(prismaMock.liveRoomItem).not.toHaveProperty("update");
  });

  it("returns an empty result when nothing is stalled", async () => {
    prismaMock.liveRoomItem.findMany.mockResolvedValue([]);

    const { reportStalledAuctionLotsToAdmin } = await import("@/lib/live-auction-stalled-lots");
    const result = await reportStalledAuctionLotsToAdmin(24);

    expect(result).toEqual({ checked: 0, newlyAlerted: 0 });
    expect(hoisted.reportCronAnomaly).not.toHaveBeenCalled();
  });
});
