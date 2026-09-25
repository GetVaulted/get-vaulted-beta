import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  liveRoom: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

const createNotification = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications", () => ({ createNotification }));

import {
  LIVE_HOST_PRESTART_WINDOW_MS,
  notifyHostsLiveShowStartingSoon,
} from "@/lib/live-host-prestart-notify";

describe("notifyHostsLiveShowStartingSoon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotification.mockResolvedValue("n1");
  });

  it("claims then notifies hosts in the 15-minute window", async () => {
    const now = new Date("2026-07-24T20:00:00.000Z");
    const start = new Date(now.getTime() + 12 * 60_000);
    prismaMock.liveRoom.findMany.mockResolvedValue([
      { id: "room_1", title: "Friday Break", sellerId: "seller_1", scheduledStartAt: start },
    ]);
    prismaMock.liveRoom.updateMany.mockResolvedValue({ count: 1 });

    const result = await notifyHostsLiveShowStartingSoon(now);

    expect(result).toEqual({ candidates: 1, notified: 1, skipped: 0 });
    expect(prismaMock.liveRoom.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "scheduled",
          hostPreStartNotifiedAt: null,
          scheduledStartAt: {
            gte: new Date(now.getTime() + 60_000),
            lte: new Date(now.getTime() + LIVE_HOST_PRESTART_WINDOW_MS),
          },
        }),
      }),
    );
    expect(createNotification).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        userId: "seller_1",
        type: "live_host_starting_soon",
        href: "/seller/live/room_1/console",
      }),
    );
  });

  it("skips notify when another worker already claimed the row", async () => {
    const now = new Date("2026-07-24T20:00:00.000Z");
    prismaMock.liveRoom.findMany.mockResolvedValue([
      {
        id: "room_1",
        title: "Friday Break",
        sellerId: "seller_1",
        scheduledStartAt: new Date(now.getTime() + 10 * 60_000),
      },
    ]);
    prismaMock.liveRoom.updateMany.mockResolvedValue({ count: 0 });

    const result = await notifyHostsLiveShowStartingSoon(now);
    expect(result).toEqual({ candidates: 1, notified: 0, skipped: 1 });
    expect(createNotification).not.toHaveBeenCalled();
  });
});
