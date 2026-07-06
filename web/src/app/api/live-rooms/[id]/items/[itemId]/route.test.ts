import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  requireLiveRoomHostUser: vi.fn(),
  itemFindFirst: vi.fn(),
  itemUpdateMany: vi.fn(),
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
      findUnique: hoisted.itemFindUnique,
    },
    liveRoom: {
      update: hoisted.roomUpdate,
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        liveRoomItem: { updateMany: hoisted.itemUpdateMany, findUnique: hoisted.itemFindUnique },
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
