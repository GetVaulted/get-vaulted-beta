import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  liveRoom: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

const createNotification = vi.hoisted(() => vi.fn());
const emitLiveDiscoveryChanged = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications", () => ({ createNotification }));
vi.mock("@/lib/realtime-emit-server", () => ({ emitLiveDiscoveryChanged }));

import {
  autoCancelNoShowScheduledShows,
  LIVE_HOST_AUTO_CANCEL_AFTER_MS,
  LIVE_HOST_T30_WINDOW_MS,
  LIVE_HOST_T5_WINDOW_MS,
  notifyHostsGoLiveNow,
  notifyHostsShowStartingT30,
  notifyHostsShowStartingT5,
} from "@/lib/live-host-show-reminders";

const NOW = new Date("2026-08-22T20:00:00.000Z");

describe("notifyHostsShowStartingT30", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotification.mockResolvedValue("n1");
  });

  it("claims then notifies hosts 24-32 minutes out", async () => {
    prismaMock.liveRoom.findMany.mockResolvedValue([
      { id: "room_1", title: "Friday Break", sellerId: "seller_1" },
    ]);
    prismaMock.liveRoom.updateMany.mockResolvedValue({ count: 1 });

    const result = await notifyHostsShowStartingT30(NOW);

    expect(result).toEqual({ candidates: 1, notified: 1, skipped: 0 });
    expect(prismaMock.liveRoom.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "scheduled",
          hostT30NotifiedAt: null,
          scheduledStartAt: {
            gte: new Date(NOW.getTime() + 24 * 60_000),
            lte: new Date(NOW.getTime() + LIVE_HOST_T30_WINDOW_MS),
          },
        }),
      }),
    );
    expect(prismaMock.liveRoom.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "room_1", status: "scheduled", hostT30NotifiedAt: null },
        data: { hostT30NotifiedAt: NOW },
      }),
    );
    expect(createNotification).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ userId: "seller_1", href: "/seller/live/room_1/console" }),
    );
  });

  it("skips when a concurrent tick already claimed the row", async () => {
    prismaMock.liveRoom.findMany.mockResolvedValue([{ id: "room_1", title: "x", sellerId: "s1" }]);
    prismaMock.liveRoom.updateMany.mockResolvedValue({ count: 0 });

    const result = await notifyHostsShowStartingT30(NOW);
    expect(result).toEqual({ candidates: 1, notified: 0, skipped: 1 });
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe("notifyHostsShowStartingT5", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotification.mockResolvedValue("n1");
  });

  it("claims then notifies hosts 1-8 minutes out", async () => {
    prismaMock.liveRoom.findMany.mockResolvedValue([{ id: "room_1", title: "x", sellerId: "s1" }]);
    prismaMock.liveRoom.updateMany.mockResolvedValue({ count: 1 });

    const result = await notifyHostsShowStartingT5(NOW);

    expect(result).toEqual({ candidates: 1, notified: 1, skipped: 0 });
    expect(prismaMock.liveRoom.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hostT5NotifiedAt: null,
          scheduledStartAt: {
            gte: new Date(NOW.getTime() + 60_000),
            lte: new Date(NOW.getTime() + LIVE_HOST_T5_WINDOW_MS),
          },
        }),
      }),
    );
  });
});

describe("notifyHostsGoLiveNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotification.mockResolvedValue("n1");
  });

  it("notifies once the scheduled start time has arrived, within the no-show grace window", async () => {
    prismaMock.liveRoom.findMany.mockResolvedValue([{ id: "room_1", title: "x", sellerId: "s1" }]);
    prismaMock.liveRoom.updateMany.mockResolvedValue({ count: 1 });

    const result = await notifyHostsGoLiveNow(NOW);

    expect(result).toEqual({ candidates: 1, notified: 1, skipped: 0 });
    expect(prismaMock.liveRoom.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hostGoLiveNotifiedAt: null,
          scheduledStartAt: {
            lte: NOW,
            gte: new Date(NOW.getTime() - LIVE_HOST_AUTO_CANCEL_AFTER_MS),
          },
        }),
      }),
    );
  });
});

describe("autoCancelNoShowScheduledShows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotification.mockResolvedValue("n1");
  });

  it("ends a scheduled show an hour past its start, notifies the seller, and emits a cancelled discovery event", async () => {
    prismaMock.liveRoom.findMany.mockResolvedValue([
      { id: "room_1", title: "Stale Show", sellerId: "seller_1", completedSalesGmvUsd: 42 },
    ]);
    prismaMock.liveRoom.updateMany.mockResolvedValue({ count: 1 });

    const result = await autoCancelNoShowScheduledShows(NOW);

    expect(result).toEqual({ candidates: 1, cancelled: 1, skipped: 0 });
    expect(prismaMock.liveRoom.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "scheduled",
          autoCancelledAt: null,
          scheduledStartAt: { lte: new Date(NOW.getTime() - LIVE_HOST_AUTO_CANCEL_AFTER_MS) },
        }),
      }),
    );
    expect(prismaMock.liveRoom.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "room_1", status: "scheduled", autoCancelledAt: null },
        data: expect.objectContaining({
          status: "ended",
          autoCancelledAt: NOW,
          completedSalesGmvUsd: 0,
          finalSalesGmvUsd: 42,
        }),
      }),
    );
    expect(emitLiveDiscoveryChanged).toHaveBeenCalledWith({
      roomId: "room_1",
      status: "ended",
      reason: "cancelled",
    });
    expect(createNotification).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ userId: "seller_1", href: "/account/seller", type: "live_host_auto_cancelled" }),
    );
  });

  it("skips when a concurrent tick already claimed the row", async () => {
    prismaMock.liveRoom.findMany.mockResolvedValue([
      { id: "room_1", title: "x", sellerId: "s1", completedSalesGmvUsd: 0 },
    ]);
    prismaMock.liveRoom.updateMany.mockResolvedValue({ count: 0 });

    const result = await autoCancelNoShowScheduledShows(NOW);
    expect(result).toEqual({ candidates: 1, cancelled: 0, skipped: 1 });
    expect(createNotification).not.toHaveBeenCalled();
    expect(emitLiveDiscoveryChanged).not.toHaveBeenCalled();
  });
});
