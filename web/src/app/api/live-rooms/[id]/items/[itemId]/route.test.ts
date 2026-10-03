import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  requireLiveRoomHostUser: vi.fn(),
  itemFindFirst: vi.fn(),
  itemUpdateMany: vi.fn(),
  itemUpdate: vi.fn(),
  itemFindUnique: vi.fn(),
  roomUpdate: vi.fn(),
  getLiveRoomItemSnapshotDto: vi.fn(),
}));

vi.mock("@/lib/resolve-live-room-host-user", () => ({
  requireLiveRoomHostUser: hoisted.requireLiveRoomHostUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    liveRoomItem: {
      findFirst: hoisted.itemFindFirst,
      updateMany: hoisted.itemUpdateMany,
      update: hoisted.itemUpdate,
      findUnique: hoisted.itemFindUnique,
    },
    liveRoom: {
      update: hoisted.roomUpdate,
    },
    liveRoomPaymentFailure: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        liveRoomItem: { updateMany: hoisted.itemUpdateMany, update: hoisted.itemUpdate, findUnique: hoisted.itemFindUnique },
        liveRoom: { update: hoisted.roomUpdate },
      }),
  },
}));

vi.mock("@/lib/live-room-item-snapshot-server", () => ({
  getLiveRoomItemSnapshotDto: hoisted.getLiveRoomItemSnapshotDto,
}));

vi.mock("@/lib/realtime-emit-server", () => ({
  emitActiveItemChanged: vi.fn(),
  emitActiveItemChangedAwait: vi.fn(),
  emitLiveRoomQueueItemsChanged: vi.fn(),
  emitPurchaseCompleted: vi.fn(),
}));

vi.mock("@/lib/live-room-payment-failure", () => ({
  liveRoomHostCommerceBlockResponse: vi.fn().mockResolvedValue(null),
}));

import { PATCH } from "@/app/api/live-rooms/[id]/items/[itemId]/route";

function baseItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item_1",
    status: "queued",
    itemVersion: 1,
    biddingOpen: false,
    auctionEndsAt: null,
    lastHighBidderId: null,
    salesFormat: "auction",
    quantity: 1,
    quantityInitial: 1,
    priceUsd: null,
    startingBidUsd: null,
    variantSpotCommerceDefault: null,
    activeSpotCommerceMode: null,
    auctionVariantId: null,
    variantAssignmentMode: null,
    variants: [],
    ...overrides,
  };
}

function patchRequest(body: unknown) {
  return new Request("http://x", { method: "PATCH", body: JSON.stringify(body) });
}

const ctx = { params: Promise.resolve({ id: "room_1", itemId: "item_1" }) };

describe("PATCH /api/live-rooms/[id]/items/[itemId] — currentBidUsd tampering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireLiveRoomHostUser.mockResolvedValue({
      userId: "seller_1",
      isAdmin: false,
      room: { id: "room_1", status: "live", sellerId: "seller_1", roomType: "auction", roomVersion: 1 },
    });
    hoisted.itemUpdateMany.mockResolvedValue({ count: 1 });
    hoisted.itemUpdate.mockResolvedValue({ itemVersion: 2 });
    hoisted.roomUpdate.mockResolvedValue({ roomVersion: 2 });
    hoisted.itemFindUnique.mockResolvedValue({ itemVersion: 2 });
    hoisted.getLiveRoomItemSnapshotDto.mockResolvedValue({ id: "item_1" });
  });

  it("rejects a host trying to set currentBidUsd while bidding is open (live)", async () => {
    hoisted.itemFindFirst.mockResolvedValue(baseItem({ status: "active", biddingOpen: true }));

    const res = await PATCH(patchRequest({ currentBidUsd: 999999 }), ctx);

    expect(res.status).toBe(400);
    expect(hoisted.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a host trying to set currentBidUsd once the item is sold", async () => {
    hoisted.itemFindFirst.mockResolvedValue(baseItem({ status: "sold", biddingOpen: false }));

    const res = await PATCH(patchRequest({ currentBidUsd: 1 }), ctx);

    expect(res.status).toBe(400);
    expect(hoisted.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("still allows clearing/setting currentBidUsd while the lot is idle (not bidding, not sold)", async () => {
    hoisted.itemFindFirst.mockResolvedValue(baseItem({ status: "queued", biddingOpen: false }));

    const res = await PATCH(patchRequest({ currentBidUsd: 25 }), ctx);

    expect(res.status).toBe(200);
    expect(hoisted.itemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentBidUsd: 25 }) }),
    );
  });

  it("does not smuggle currentBidUsd through alongside an unrelated field while bidding is open", async () => {
    hoisted.itemFindFirst.mockResolvedValue(baseItem({ status: "active", biddingOpen: true }));

    const res = await PATCH(patchRequest({ sortOrder: 3, currentBidUsd: 42 }), ctx);

    expect(res.status).toBe(200);
    const [[call]] = hoisted.itemUpdateMany.mock.calls;
    expect(call.data).not.toHaveProperty("currentBidUsd");
    expect(call.data.sortOrder).toBe(3);
  });
});

describe("PATCH /api/live-rooms/[id]/items/[itemId] — setCommerceFormat security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireLiveRoomHostUser.mockResolvedValue({
      userId: "seller_1",
      isAdmin: false,
      room: { id: "room_1", status: "live", sellerId: "seller_1", roomType: "auction", roomVersion: 1 },
    });
    hoisted.itemUpdate.mockResolvedValue({ itemVersion: 2 });
    hoisted.getLiveRoomItemSnapshotDto.mockResolvedValue({ id: "item_1" });
  });

  it("automatically sets startingBidUsd from previous priceUsd when switching from buy_now to auction", async () => {
    hoisted.itemFindFirst.mockResolvedValue(
      baseItem({ salesFormat: "buy_now", priceUsd: 100, startingBidUsd: null, biddingOpen: false }),
    );

    const res = await PATCH(patchRequest({ action: "setCommerceFormat", salesFormat: "auction" }), ctx);

    expect(res.status).toBe(200);
    expect(hoisted.itemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item_1" },
        data: expect.objectContaining({
          salesFormat: "auction",
          startingBidUsd: 100, // Should inherit from previous priceUsd
        }),
      }),
    );
  });

  it("uses explicitly provided startingBidUsd when switching from buy_now to auction", async () => {
    hoisted.itemFindFirst.mockResolvedValue(
      baseItem({ salesFormat: "buy_now", priceUsd: 100, startingBidUsd: null, biddingOpen: false }),
    );

    const res = await PATCH(
      patchRequest({ action: "setCommerceFormat", salesFormat: "auction", startingBidUsd: 1 }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(hoisted.itemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item_1" },
        data: expect.objectContaining({
          salesFormat: "auction",
          startingBidUsd: 1, // Should use explicitly provided value
        }),
      }),
    );
  });

  it("defaults to $1 when switching from buy_now to auction with no previous price", async () => {
    hoisted.itemFindFirst.mockResolvedValue(
      baseItem({ salesFormat: "buy_now", priceUsd: null, startingBidUsd: null, biddingOpen: false }),
    );

    const res = await PATCH(patchRequest({ action: "setCommerceFormat", salesFormat: "auction" }), ctx);

    expect(res.status).toBe(200);
    expect(hoisted.itemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item_1" },
        data: expect.objectContaining({
          salesFormat: "auction",
          startingBidUsd: 1, // Should default to $1
        }),
      }),
    );
  });

  it("does not modify startingBidUsd when switching from auction to buy_now", async () => {
    hoisted.itemFindFirst.mockResolvedValue(
      baseItem({ salesFormat: "auction", priceUsd: null, startingBidUsd: 50, biddingOpen: false }),
    );

    const res = await PATCH(patchRequest({ action: "setCommerceFormat", salesFormat: "buy_now" }), ctx);

    expect(res.status).toBe(200);
    expect(hoisted.itemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item_1" },
        data: expect.objectContaining({
          salesFormat: "buy_now",
        }),
      }),
    );
    const [[call]] = hoisted.itemUpdate.mock.calls;
    expect(call.data).not.toHaveProperty("startingBidUsd");
  });
});
