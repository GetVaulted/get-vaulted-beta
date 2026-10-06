import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: the follower lookup previously had no `take` at all — a viral seller's follower
// list would be fetched (and notification rows created) in full, unbounded, on every Go Live
// (performance audit 2026-07).

const findMany = vi.fn().mockResolvedValue([]);
const createMany = vi.fn().mockResolvedValue({ count: 0 });
const findUnique = vi.fn().mockResolvedValue({ discoveryVisibility: "public" });
const userFindUnique = vi.fn().mockResolvedValue({ followerNotifiedAt: null });
const userUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveRoom: { findUnique: (...a: unknown[]) => findUnique(...a) },
    sellerFollow: { findMany: (...a: unknown[]) => findMany(...a) },
    notification: { createMany: (...a: unknown[]) => createMany(...a) },
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      updateMany: (...a: unknown[]) => userUpdateMany(...a),
    },
  },
}));

import { notifyFollowersSellerWentLive } from "./seller-follow-notify";

describe("notifyFollowersSellerWentLive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({ discoveryVisibility: "public" });
    userFindUnique.mockResolvedValue({ followerNotifiedAt: null });
    userUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("caps the follower lookup", async () => {
    await notifyFollowersSellerWentLive("seller_1", "sellerhandle", "room_1");
    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0]?.[0] as { take?: number };
    expect(args.take).toBeGreaterThan(0);
  });

  it("no-ops without inserting notifications when the seller has no followers", async () => {
    findMany.mockResolvedValue([]);
    await notifyFollowersSellerWentLive("seller_1", "sellerhandle", "room_1");
    expect(createMany).not.toHaveBeenCalled();
  });

  it("creates one notification row per follower", async () => {
    findMany.mockResolvedValue([{ followerId: "f1" }, { followerId: "f2" }]);
    await notifyFollowersSellerWentLive("seller_1", "sellerhandle", "room_1");
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: "f1", type: "seller_live" }),
        expect.objectContaining({ userId: "f2", type: "seller_live" }),
      ],
    });
  });

  it("never blasts followers for private (unlisted) shows", async () => {
    findUnique.mockResolvedValue({ discoveryVisibility: "private" });
    findMany.mockResolvedValue([{ followerId: "f1" }]);
    await notifyFollowersSellerWentLive("seller_1", "sellerhandle", "room_private");
    expect(findMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it("stays quiet when the seller already notified their followers within the hour", async () => {
    findMany.mockResolvedValue([{ followerId: "f1" }]);
    userFindUnique.mockResolvedValue({ followerNotifiedAt: new Date(Date.now() - 10 * 60000) });
    await notifyFollowersSellerWentLive("seller_1", "sellerhandle", "room_1");
    expect(createMany).not.toHaveBeenCalled();
  });

  it("gives the hour back if creating the notifications fails", async () => {
    findMany.mockResolvedValue([{ followerId: "f1" }]);
    createMany.mockRejectedValueOnce(new Error("db down"));
    await expect(notifyFollowersSellerWentLive("seller_1", "sellerhandle", "room_1")).rejects.toThrow("db down");
    expect(userUpdateMany).toHaveBeenCalledTimes(2); // claim, then release
  });
});
