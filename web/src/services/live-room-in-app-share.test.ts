import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  roomFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdateMany: vi.fn(),
  followFindMany: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveRoom: { findUnique: hoisted.roomFindUnique },
    user: { findUnique: hoisted.userFindUnique, updateMany: hoisted.userUpdateMany },
    sellerFollow: { findMany: hoisted.followFindMany },
  },
}));
vi.mock("@/lib/notifications", () => ({ createNotification: hoisted.createNotification }));

import { shareLiveRoomInApp } from "./live-room-in-app-share";

const room = { id: "room_1", title: "Friday break", sellerId: "seller_1", status: "live", discoveryVisibility: "public" };

describe("shareLiveRoomInApp — follower notifications are limited to one per hour per seller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.roomFindUnique.mockResolvedValue(room);
    hoisted.followFindMany.mockResolvedValue([{ followerId: "f1" }, { followerId: "f2" }]);
    hoisted.createNotification.mockResolvedValue("n1");
    hoisted.userUpdateMany.mockResolvedValue({ count: 1 });
    // First call is the sender's username lookup, later ones the slot lookup.
    hoisted.userFindUnique.mockImplementation(async (args: { select: Record<string, boolean> }) =>
      args.select.username ? { username: "seller" } : { followerNotifiedAt: null },
    );
  });

  it("notifies every follower the first time", async () => {
    const res = await shareLiveRoomInApp({ senderId: "seller_1", liveRoomId: "room_1", notifyFollowers: true });
    expect(res).toEqual({ sent: 2, skipped: 0 });
    expect(hoisted.createNotification).toHaveBeenCalledTimes(2);
  });

  it("refuses a second blast within the hour, even for a different show", async () => {
    hoisted.roomFindUnique.mockResolvedValue({ ...room, id: "room_2" });
    hoisted.userFindUnique.mockImplementation(async (args: { select: Record<string, boolean> }) =>
      args.select.username ? { username: "seller" } : { followerNotifiedAt: new Date(Date.now() - 15 * 60000) },
    );
    await expect(
      shareLiveRoomInApp({ senderId: "seller_1", liveRoomId: "room_2", notifyFollowers: true }),
    ).rejects.toThrow(/^FOLLOWER_NOTIFY_COOLDOWN:4\d$/);
    expect(hoisted.createNotification).not.toHaveBeenCalled();
  });

  it("does not use up the hour when the seller has no followers", async () => {
    hoisted.followFindMany.mockResolvedValue([]);
    const res = await shareLiveRoomInApp({ senderId: "seller_1", liveRoomId: "room_1", notifyFollowers: true });
    expect(res).toEqual({ sent: 0, skipped: 0 });
    expect(hoisted.userUpdateMany).not.toHaveBeenCalled();
  });

  it("gives the hour back if nothing could be sent", async () => {
    hoisted.createNotification.mockResolvedValue(null);
    const res = await shareLiveRoomInApp({ senderId: "seller_1", liveRoomId: "room_1", notifyFollowers: true });
    expect(res.sent).toBe(0);
    expect(hoisted.userUpdateMany).toHaveBeenCalledTimes(2); // claim, then release
  });
});
