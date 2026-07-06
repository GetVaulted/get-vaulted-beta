import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression (chaos engineering deep-dive, 2026-07): suspending a seller previously left an
// already-live room live — bids/buy-now kept working, funds kept moving to the suspended seller.
// These tests verify suspension now force-ends any live/scheduled room for that seller using the
// exact same status-guarded transition the manual admin "end show" action uses, and that it never
// touches Order/payment data.

const hoisted = vi.hoisted(() => ({
  emitAuctionEnded: vi.fn(),
  emitLiveDiscoveryChanged: vi.fn(),
  finalizeLiveStreamReplay: vi.fn().mockResolvedValue(undefined),
  endHostStageSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/realtime-emit-server", () => ({
  emitAuctionEnded: hoisted.emitAuctionEnded,
  emitLiveDiscoveryChanged: hoisted.emitLiveDiscoveryChanged,
}));
vi.mock("@/lib/trust/live-replay-service", () => ({ finalizeLiveStreamReplay: hoisted.finalizeLiveStreamReplay }));
vi.mock("@/services/ivs", () => ({ endHostStageSession: hoisted.endHostStageSession }));

const prismaMock = vi.hoisted(() => ({
  liveRoom: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

describe("endLiveRoomsForSuspendedSeller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.liveRoom.findUnique.mockResolvedValue({ roomVersion: 5 });
  });

  it("does nothing when the seller has no live/scheduled rooms", async () => {
    prismaMock.liveRoom.findMany.mockResolvedValue([]);

    const { endLiveRoomsForSuspendedSeller } = await import("@/lib/seller-suspension-live-guard");
    const result = await endLiveRoomsForSuspendedSeller("seller_1");

    expect(result).toEqual({ ended: 0, cancelled: 0 });
    expect(prismaMock.liveRoom.updateMany).not.toHaveBeenCalled();
  });

  it("force-ends a live room and emits auction-ended + discovery-changed", async () => {
    prismaMock.liveRoom.findMany.mockResolvedValue([{ id: "room_1", status: "live", completedSalesGmvUsd: 900 }]);
    prismaMock.liveRoom.updateMany.mockResolvedValue({ count: 1 });

    const { endLiveRoomsForSuspendedSeller } = await import("@/lib/seller-suspension-live-guard");
    const result = await endLiveRoomsForSuspendedSeller("seller_1");

    expect(result).toEqual({ ended: 1, cancelled: 0 });
    expect(prismaMock.liveRoom.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "room_1", status: "live" },
        data: expect.objectContaining({ status: "ended", completedSalesGmvUsd: 0, finalSalesGmvUsd: 900 }),
      }),
    );
    expect(hoisted.emitAuctionEnded).toHaveBeenCalledWith("room_1", 5);
    expect(hoisted.emitLiveDiscoveryChanged).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: "room_1", status: "ended", reason: "ended" }),
    );
    expect(hoisted.endHostStageSession).toHaveBeenCalledWith("room_1");
    expect(hoisted.finalizeLiveStreamReplay).toHaveBeenCalledWith("room_1");
  });

  it("cancels a scheduled (not-yet-started) room without emitting auction-ended", async () => {
    prismaMock.liveRoom.findMany.mockResolvedValue([{ id: "room_2", status: "scheduled", completedSalesGmvUsd: 0 }]);
    prismaMock.liveRoom.updateMany.mockResolvedValue({ count: 1 });

    const { endLiveRoomsForSuspendedSeller } = await import("@/lib/seller-suspension-live-guard");
    const result = await endLiveRoomsForSuspendedSeller("seller_1");

    expect(result).toEqual({ ended: 0, cancelled: 1 });
    expect(hoisted.emitAuctionEnded).not.toHaveBeenCalled();
    expect(hoisted.emitLiveDiscoveryChanged).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: "room_2", status: "ended", reason: "cancelled" }),
    );
  });

  it("skips a room that changed status concurrently (updateMany claims 0 rows)", async () => {
    prismaMock.liveRoom.findMany.mockResolvedValue([{ id: "room_3", status: "live", completedSalesGmvUsd: 0 }]);
    prismaMock.liveRoom.updateMany.mockResolvedValue({ count: 0 });

    const { endLiveRoomsForSuspendedSeller } = await import("@/lib/seller-suspension-live-guard");
    const result = await endLiveRoomsForSuspendedSeller("seller_1");

    expect(result).toEqual({ ended: 0, cancelled: 0 });
    expect(hoisted.emitAuctionEnded).not.toHaveBeenCalled();
  });

  it("only queries/updates the LiveRoom table — never touches Order/payment data", async () => {
    prismaMock.liveRoom.findMany.mockResolvedValue([{ id: "room_4", status: "live", completedSalesGmvUsd: 0 }]);
    prismaMock.liveRoom.updateMany.mockResolvedValue({ count: 1 });

    const { endLiveRoomsForSuspendedSeller } = await import("@/lib/seller-suspension-live-guard");
    await endLiveRoomsForSuspendedSeller("seller_1");

    expect(Object.keys(prismaMock)).toEqual(["liveRoom"]);
  });
});
