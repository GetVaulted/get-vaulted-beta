import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/** Host fixes the buyer on a spot they marked sold off-platform (typed the wrong username). */

const hoisted = vi.hoisted(() => ({
  requireHost: vi.fn(),
  userFindFirst: vi.fn(),
  roomFindUnique: vi.fn(),
  purchaseFindFirst: vi.fn(),
  purchaseUpdate: vi.fn(),
  itemUpdate: vi.fn(),
  roomUpdate: vi.fn(),
  emitQueue: vi.fn(),
}));

vi.mock("@/lib/resolve-live-room-host-user", () => ({ requireLiveRoomHostUser: hoisted.requireHost }));
vi.mock("@/lib/realtime-emit-server", () => ({
  emitLiveRoomQueueItemsChanged: hoisted.emitQueue,
  emitPurchaseCompleted: vi.fn(),
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    liveRoom: { findUnique: hoisted.roomFindUnique, update: hoisted.roomUpdate },
    liveItemVariantPurchase: { findFirst: hoisted.purchaseFindFirst, update: hoisted.purchaseUpdate },
    liveRoomItem: { update: hoisted.itemUpdate },
  };
  return {
    prisma: {
      user: { findFirst: hoisted.userFindFirst },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { PATCH } from "./route";

const ctx = { params: Promise.resolve({ id: "room1", itemId: "item1", variantId: "var1" }) };
const req = (body: unknown) =>
  new Request("http://x", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("PATCH manual-assign (change buyer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireHost.mockResolvedValue({ userId: "host1" });
    hoisted.userFindFirst.mockResolvedValue({ id: "buyer2", username: "RightName" });
    hoisted.roomFindUnique.mockResolvedValue({ id: "room1", status: "live" });
    hoisted.roomUpdate.mockResolvedValue({ roomVersion: 9 });
    hoisted.purchaseFindFirst.mockResolvedValue({
      id: "p1",
      buyerId: "buyer1",
      fulfillmentOrderId: null,
      sweet16DraftPick: null,
      buyer: { username: "WrongName" },
    });
  });

  it("moves the sale to the corrected buyer and nothing else", async () => {
    const res = await PATCH(req({ username: "@RightName" }), ctx);
    expect(res.status).toBe(200);
    expect(hoisted.purchaseUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { buyerId: "buyer2" } });
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, buyerUsername: "RightName", previousUsername: "WrongName" });
    expect(hoisted.emitQueue).toHaveBeenCalledWith("room1");
  });

  it("rejects a username that does not exist", async () => {
    hoisted.userFindFirst.mockResolvedValue(null);
    const res = await PATCH(req({ username: "nobodyhere" }), ctx);
    expect(res.status).toBe(404);
    expect(hoisted.purchaseUpdate).not.toHaveBeenCalled();
  });

  it("only touches off-platform sales", async () => {
    hoisted.purchaseFindFirst.mockResolvedValue(null);
    const res = await PATCH(req({ username: "RightName" }), ctx);
    expect(res.status).toBe(409);
    expect(hoisted.purchaseUpdate).not.toHaveBeenCalled();
    expect(hoisted.purchaseFindFirst.mock.calls[0][0].where.settlementChannel).toBe("off_platform");
  });

  it("refuses once the sale is attached to an order", async () => {
    hoisted.purchaseFindFirst.mockResolvedValue({
      id: "p1", buyerId: "buyer1", fulfillmentOrderId: "ord1", sweet16DraftPick: null, buyer: { username: "WrongName" },
    });
    const res = await PATCH(req({ username: "RightName" }), ctx);
    expect(res.status).toBe(409);
    expect(hoisted.purchaseUpdate).not.toHaveBeenCalled();
  });

  it("is host-only", async () => {
    hoisted.requireHost.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await PATCH(req({ username: "RightName" }), ctx);
    expect(res.status).toBe(403);
    expect(hoisted.purchaseUpdate).not.toHaveBeenCalled();
  });
});
