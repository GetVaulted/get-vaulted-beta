import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  userBlockFindFirst: vi.fn(),
  userBlockUpsert: vi.fn(),
  userBlockDeleteMany: vi.fn(),
  participantFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userBlock: {
      findFirst: hoisted.userBlockFindFirst,
      upsert: hoisted.userBlockUpsert,
      deleteMany: hoisted.userBlockDeleteMany,
    },
    messageThreadParticipant: {
      findFirst: hoisted.participantFindFirst,
    },
  },
}));

import { isUserBlocked, setUserBlocked } from "@/lib/user-block";
import { prisma } from "@/lib/prisma";

describe("isUserBlocked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for the same user (self is never blocked from self)", async () => {
    const result = await isUserBlocked(prisma, "user_1", "user_1");
    expect(result).toBe(false);
    expect(hoisted.userBlockFindFirst).not.toHaveBeenCalled();
  });

  it("returns true when a durable UserBlock row exists in either direction", async () => {
    hoisted.userBlockFindFirst.mockResolvedValue({ id: "block_1" });

    const result = await isUserBlocked(prisma, "buyer_1", "seller_1");

    expect(result).toBe(true);
    expect(hoisted.userBlockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { blockerId: "buyer_1", blockedId: "seller_1" },
            { blockerId: "seller_1", blockedId: "buyer_1" },
          ],
        },
      }),
    );
    // Short-circuits — no need to fall back to the legacy per-thread scan.
    expect(hoisted.participantFindFirst).not.toHaveBeenCalled();
  });

  it("falls back to legacy per-thread MessageThreadParticipant.blocked flags when no UserBlock row exists", async () => {
    hoisted.userBlockFindFirst.mockResolvedValue(null);
    hoisted.participantFindFirst.mockResolvedValue({ id: "participant_1" });

    const result = await isUserBlocked(prisma, "buyer_1", "seller_1");

    expect(result).toBe(true);
    expect(hoisted.participantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          blocked: true,
          userId: { in: ["buyer_1", "seller_1"] },
        }),
      }),
    );
  });

  it("returns false when neither a UserBlock row nor a legacy thread block exists", async () => {
    hoisted.userBlockFindFirst.mockResolvedValue(null);
    hoisted.participantFindFirst.mockResolvedValue(null);

    const result = await isUserBlocked(prisma, "buyer_1", "seller_1");

    expect(result).toBe(false);
  });
});

describe("setUserBlocked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts a UserBlock row when blocking", async () => {
    await setUserBlocked(prisma, { blockerId: "buyer_1", blockedId: "seller_1", blocked: true });

    expect(hoisted.userBlockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { blockerId_blockedId: { blockerId: "buyer_1", blockedId: "seller_1" } },
        create: { blockerId: "buyer_1", blockedId: "seller_1" },
      }),
    );
    expect(hoisted.userBlockDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes the UserBlock row when unblocking", async () => {
    await setUserBlocked(prisma, { blockerId: "buyer_1", blockedId: "seller_1", blocked: false });

    expect(hoisted.userBlockDeleteMany).toHaveBeenCalledWith({
      where: { blockerId: "buyer_1", blockedId: "seller_1" },
    });
    expect(hoisted.userBlockUpsert).not.toHaveBeenCalled();
  });

  it("is a no-op when blocker and blocked are the same user", async () => {
    await setUserBlocked(prisma, { blockerId: "user_1", blockedId: "user_1", blocked: true });

    expect(hoisted.userBlockUpsert).not.toHaveBeenCalled();
    expect(hoisted.userBlockDeleteMany).not.toHaveBeenCalled();
  });
});
