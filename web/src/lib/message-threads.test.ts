import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  sellerFollowCount: vi.fn(),
  messageThreadCount: vi.fn(),
  messageThreadFindMany: vi.fn(),
  messageThreadUpdateMany: vi.fn(),
  messageFindMany: vi.fn(),
  orderCount: vi.fn(),
  offerCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sellerFollow: { count: hoisted.sellerFollowCount },
    messageThread: {
      count: hoisted.messageThreadCount,
      findMany: hoisted.messageThreadFindMany,
      updateMany: hoisted.messageThreadUpdateMany,
    },
    message: { findMany: hoisted.messageFindMany },
    order: { count: hoisted.orderCount },
    offer: { count: hoisted.offerCount },
  },
}));

import {
  healRequestThreadsAcceptedByReply,
  resolveInboxForNewThread,
  usersMutuallyFollow,
} from "./message-threads";

/** Follow graph helper: `follows` is a set of "follower>seller" edges. */
function mockFollows(edges: string[]) {
  const set = new Set(edges);
  hoisted.sellerFollowCount.mockImplementation(async (args: { where: { followerId: string; sellerId: string } }) => {
    return set.has(`${args.where.followerId}>${args.where.sellerId}`) ? 1 : 0;
  });
}

describe("usersMutuallyFollow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is true only when both follow edges exist", async () => {
    mockFollows(["a>b", "b>a"]);
    expect(await usersMutuallyFollow("a", "b")).toBe(true);
  });

  it("is false for a one-way follow", async () => {
    mockFollows(["a>b"]);
    expect(await usersMutuallyFollow("a", "b")).toBe(false);
  });

  it("is false (and hits no query) for the same user", async () => {
    expect(await usersMutuallyFollow("a", "a")).toBe(false);
    expect(hoisted.sellerFollowCount).not.toHaveBeenCalled();
  });
});

describe("resolveInboxForNewThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.messageThreadCount.mockResolvedValue(0);
    hoisted.orderCount.mockResolvedValue(0);
    hoisted.offerCount.mockResolvedValue(0);
  });

  it("routes to the inbox when the two accounts follow each other", async () => {
    mockFollows(["buyer>seller", "seller>buyer"]);
    expect(await resolveInboxForNewThread("buyer", "seller")).toBe("primary");
  });

  it("routes a cold, one-way-follow contact to the request folder", async () => {
    mockFollows(["buyer>seller"]); // buyer follows seller, not mutual
    expect(await resolveInboxForNewThread("buyer", "seller")).toBe("request");
  });

  it("routes strangers (no follow, no prior trust) to the request folder", async () => {
    mockFollows([]);
    expect(await resolveInboxForNewThread("buyer", "seller")).toBe("request");
  });

  it("still routes to the inbox on prior commerce even without a mutual follow", async () => {
    mockFollows([]);
    hoisted.orderCount.mockResolvedValue(1);
    expect(await resolveInboxForNewThread("buyer", "seller")).toBe("primary");
  });
});

describe("healRequestThreadsAcceptedByReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.messageThreadFindMany.mockResolvedValue([]);
    hoisted.messageFindMany.mockResolvedValue([]);
    hoisted.messageThreadUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("promotes request threads where the recipient already replied", async () => {
    hoisted.messageThreadFindMany.mockResolvedValue([
      { id: "t1", sellerId: "seller_1" },
      { id: "t2", sellerId: "seller_2" },
    ]);
    hoisted.messageFindMany.mockResolvedValue([{ threadId: "t1" }]);
    hoisted.messageThreadUpdateMany.mockResolvedValue({ count: 1 });

    await expect(healRequestThreadsAcceptedByReply("buyer_1")).resolves.toBe(1);
    expect(hoisted.messageThreadUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1"] }, inbox: "request" },
      data: { inbox: "primary" },
    });
  });

  it("no-ops when there are no request threads", async () => {
    await expect(healRequestThreadsAcceptedByReply("buyer_1")).resolves.toBe(0);
    expect(hoisted.messageFindMany).not.toHaveBeenCalled();
  });
});
