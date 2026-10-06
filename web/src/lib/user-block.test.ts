import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  userBlockFindFirst: vi.fn(),
  userBlockFindMany: vi.fn(),
  userBlockUpsert: vi.fn(),
  userBlockDeleteMany: vi.fn(),
  participantFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  sellerFollowDeleteMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userBlock: {
      findFirst: hoisted.userBlockFindFirst,
      findMany: hoisted.userBlockFindMany,
      upsert: hoisted.userBlockUpsert,
      deleteMany: hoisted.userBlockDeleteMany,
    },
    messageThreadParticipant: {
      findFirst: hoisted.participantFindFirst,
    },
    user: {
      findUnique: hoisted.userFindUnique,
    },
    sellerFollow: {
      deleteMany: hoisted.sellerFollowDeleteMany,
    },
  },
}));

import {
  assertCanBlockUser,
  isUserBlocked,
  listHiddenPeerIdsForViewer,
  setUserBlocked,
  viewerCanSeeUser,
  UserBlockError,
} from "@/lib/user-block";
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
    expect(hoisted.participantFindFirst).not.toHaveBeenCalled();
  });

  it("falls back to legacy per-thread MessageThreadParticipant.blocked flags when no UserBlock row exists", async () => {
    hoisted.userBlockFindFirst.mockResolvedValue(null);
    hoisted.participantFindFirst.mockResolvedValue({ id: "participant_1" });

    const result = await isUserBlocked(prisma, "buyer_1", "seller_1");

    expect(result).toBe(true);
  });

  it("returns false when neither a UserBlock row nor a legacy thread block exists", async () => {
    hoisted.userBlockFindFirst.mockResolvedValue(null);
    hoisted.participantFindFirst.mockResolvedValue(null);

    const result = await isUserBlocked(prisma, "buyer_1", "seller_1");

    expect(result).toBe(false);
  });
});

describe("assertCanBlockUser / setUserBlocked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects blocking an admin", async () => {
    hoisted.userFindUnique.mockResolvedValue({ id: "admin_1", role: "admin" });
    await expect(
      assertCanBlockUser(prisma, { blockerId: "user_1", blockedId: "admin_1" }),
    ).rejects.toMatchObject({ code: "CANNOT_BLOCK_ADMIN" });
  });

  it("upserts a UserBlock row when blocking a normal user and drops follows", async () => {
    hoisted.userFindUnique.mockResolvedValue({ id: "seller_1", role: "user" });
    await setUserBlocked(prisma, { blockerId: "buyer_1", blockedId: "seller_1", blocked: true });

    expect(hoisted.userBlockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { blockerId_blockedId: { blockerId: "buyer_1", blockedId: "seller_1" } },
        create: { blockerId: "buyer_1", blockedId: "seller_1" },
      }),
    );
    expect(hoisted.sellerFollowDeleteMany).toHaveBeenCalled();
    expect(hoisted.userBlockDeleteMany).not.toHaveBeenCalled();
  });

  it("throws when trying to block an admin via setUserBlocked", async () => {
    hoisted.userFindUnique.mockResolvedValue({ id: "admin_1", role: "admin" });
    await expect(
      setUserBlocked(prisma, { blockerId: "buyer_1", blockedId: "admin_1", blocked: true }),
    ).rejects.toBeInstanceOf(UserBlockError);
    expect(hoisted.userBlockUpsert).not.toHaveBeenCalled();
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

describe("viewerCanSeeUser / listHiddenPeerIdsForViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("always lets viewers see admins", async () => {
    hoisted.userFindUnique
      .mockResolvedValueOnce({ role: "user" })
      .mockResolvedValueOnce({ role: "admin" });
    await expect(viewerCanSeeUser(prisma, "user_1", "admin_1")).resolves.toBe(true);
    expect(hoisted.userBlockFindFirst).not.toHaveBeenCalled();
  });

  it("hides peers in either block direction for normal viewers", async () => {
    hoisted.userFindUnique.mockResolvedValue({ role: "user" });
    hoisted.userBlockFindMany.mockResolvedValue([
      {
        blockerId: "me",
        blockedId: "them",
        blocker: { role: "user" },
        blockedUser: { role: "user" },
      },
      {
        blockerId: "other",
        blockedId: "me",
        blocker: { role: "user" },
        blockedUser: { role: "user" },
      },
      {
        blockerId: "me",
        blockedId: "admin_1",
        blocker: { role: "user" },
        blockedUser: { role: "admin" },
      },
    ]);

    const hidden = await listHiddenPeerIdsForViewer(prisma, "me");
    expect(hidden.sort()).toEqual(["other", "them"]);
  });

  it("returns no hidden peers for admin viewers", async () => {
    hoisted.userFindUnique.mockResolvedValue({ role: "admin" });
    const hidden = await listHiddenPeerIdsForViewer(prisma, "admin_1");
    expect(hidden).toEqual([]);
    expect(hoisted.userBlockFindMany).not.toHaveBeenCalled();
  });
});
