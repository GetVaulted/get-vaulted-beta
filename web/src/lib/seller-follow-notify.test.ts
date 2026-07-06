import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: the follower lookup previously had no `take` at all — a viral seller's follower
// list would be fetched (and notification rows created) in full, unbounded, on every Go Live
// (performance audit 2026-07).

const findMany = vi.fn().mockResolvedValue([]);
const createMany = vi.fn().mockResolvedValue({ count: 0 });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sellerFollow: { findMany: (...a: unknown[]) => findMany(...a) },
    notification: { createMany: (...a: unknown[]) => createMany(...a) },
  },
}));

import { notifyFollowersSellerWentLive } from "./seller-follow-notify";

describe("notifyFollowersSellerWentLive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
