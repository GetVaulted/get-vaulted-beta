import { describe, expect, it, vi, beforeEach } from "vitest";

const findManyUser = vi.hoisted(() => vi.fn());
const findManyFollow = vi.hoisted(() => vi.fn());
const listHidden = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: findManyUser },
    sellerFollow: { findMany: findManyFollow },
  },
}));
vi.mock("@/lib/user-block", () => ({
  listHiddenPeerIdsForViewer: listHidden,
}));

import { searchPeopleUsers } from "@/lib/people-search";

describe("searchPeopleUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listHidden.mockResolvedValue([]);
    findManyFollow.mockResolvedValue([]);
    findManyUser.mockResolvedValue([
      {
        id: "u1",
        username: "vaultking",
        image: null,
        _count: { sellerFollowsAsSeller: 12 },
      },
    ]);
  });

  it("returns empty for blank query", async () => {
    expect(await searchPeopleUsers("  ", "viewer")).toEqual([]);
    expect(findManyUser).not.toHaveBeenCalled();
  });

  it("strips @ and matches username substring", async () => {
    await searchPeopleUsers("@Vault", "viewer");
    expect(findManyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          username: { contains: "vault" },
          suspendedAt: null,
          accountDeletedAt: null,
        }),
        take: 24,
      }),
    );
  });

  it("marks following when viewer already follows", async () => {
    findManyFollow.mockResolvedValue([{ sellerId: "u1" }]);
    const rows = await searchPeopleUsers("vault", "viewer");
    expect(rows[0]).toMatchObject({
      id: "u1",
      username: "vaultking",
      following: true,
      followerCount: 12,
    });
  });
});
