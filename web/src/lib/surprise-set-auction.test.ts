import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  emitSpin: vi.fn().mockResolvedValue(undefined),
  emitQueue: vi.fn(),
  emitMsg: vi.fn().mockResolvedValue(undefined),
  anomaly: vi.fn(),
  assigned: vi.fn(),
}));

vi.mock("@/lib/realtime-emit-server", () => ({
  emitVaultRevealSpinAndWait: hoisted.emitSpin,
  emitLiveRoomQueueItemsChanged: hoisted.emitQueue,
  emitLiveRoomMessageById: hoisted.emitMsg,
}));
vi.mock("@/lib/cron-anomaly-alert", () => ({ reportUrgentPaymentAnomaly: hoisted.anomaly }));
vi.mock("@/lib/live-item-variant-random-reveal", async () => {
  const names = (raw: unknown) =>
    Array.isArray(raw) && raw.length ? raw.map((r) => (r as { name: string }).name) : null;
  return {
    assignedLabelsForItem: hoisted.assigned,
    surpriseSetItemNames: names,
    randomPoolFromCustomLabels: (labels: string[]) => labels.map((label) => ({ label })),
    buildRandomRevealSpinPayload: (args: { purchaseId: string; winnerIndex: number; remaining: { label: string }[] }) => ({
      spinId: args.purchaseId,
      winnerLabel: args.remaining[args.winnerIndex]!.label,
    }),
  };
});

const prismaMock = vi.hoisted(() => ({
  surpriseAuctionDraw: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  liveRoomItem: { findUnique: vi.fn(), update: vi.fn() },
  liveRoomMessage: { create: vi.fn().mockResolvedValue({ id: "msg1" }) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  isSurpriseAuctionItem,
  recordSurpriseAuctionDrawTx,
  releaseSurpriseAuctionDrawForCancelledOrder,
  revealSurpriseAuctionDrawForOrder,
} from "@/lib/surprise-set-auction";

const SET = [
  { name: "Chase", quantity: 1 },
  { name: "Pack", quantity: 2 },
];
const LABELS = ["Chase (1 of 1)", "Pack (1 of 2)", "Pack (2 of 2)"];

function item() {
  return {
    id: "item1",
    title: "Mystery",
    liveRoomId: "room1",
    customRandomPoolLabels: LABELS,
    surpriseSetItems: SET,
    liveRoom: { sellerId: "seller1" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.liveRoomMessage.create.mockResolvedValue({ id: "msg1" });
});

describe("isSurpriseAuctionItem", () => {
  it("is true only for auction-format items with set contents", () => {
    expect(isSurpriseAuctionItem({ salesFormat: "auction", surpriseSetItems: SET })).toBe(true);
    expect(isSurpriseAuctionItem({ salesFormat: "auction", surpriseSetItems: null })).toBe(false);
    expect(isSurpriseAuctionItem({ salesFormat: "variant_selection", surpriseSetItems: SET })).toBe(false);
  });
});

describe("recordSurpriseAuctionDrawTx", () => {
  it("records a pending draw for a surprise auction order", async () => {
    prismaMock.liveRoomItem.findUnique.mockResolvedValue({ salesFormat: "auction", surpriseSetItems: SET });
    await recordSurpriseAuctionDrawTx(prismaMock as never, { liveRoomItemId: "item1", orderId: "o1", buyerId: "u1" });
    expect(prismaMock.surpriseAuctionDraw.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: "o1" } }),
    );
  });

  it("skips regular auction items", async () => {
    prismaMock.liveRoomItem.findUnique.mockResolvedValue({ salesFormat: "auction", surpriseSetItems: null });
    await recordSurpriseAuctionDrawTx(prismaMock as never, { liveRoomItemId: "item1", orderId: "o1", buyerId: "u1" });
    expect(prismaMock.surpriseAuctionDraw.upsert).not.toHaveBeenCalled();
  });
});

describe("revealSurpriseAuctionDrawForOrder", () => {
  it("does nothing for orders that aren't surprise auctions", async () => {
    prismaMock.surpriseAuctionDraw.findUnique.mockResolvedValue(null);
    expect(await revealSurpriseAuctionDrawForOrder("o1")).toBeNull();
    expect(hoisted.emitSpin).not.toHaveBeenCalled();
  });

  it("is idempotent once revealed", async () => {
    prismaMock.surpriseAuctionDraw.findUnique.mockResolvedValue({
      id: "d1",
      liveRoomItemId: "item1",
      revealedLabel: "Pack (1 of 2)",
      buyer: { username: "bob" },
    });
    expect(await revealSurpriseAuctionDrawForOrder("o1")).toEqual({ label: "Pack (1 of 2)" });
    expect(prismaMock.surpriseAuctionDraw.updateMany).not.toHaveBeenCalled();
  });

  it("draws only from units not already taken, then broadcasts and posts chat", async () => {
    prismaMock.surpriseAuctionDraw.findUnique.mockResolvedValue({
      id: "d1",
      liveRoomItemId: "item1",
      revealedLabel: null,
      buyer: { username: "bob" },
    });
    prismaMock.liveRoomItem.findUnique.mockResolvedValue(item());
    hoisted.assigned.mockResolvedValue(new Set(["chase (1 of 1)", "pack (1 of 2)"]));
    prismaMock.surpriseAuctionDraw.updateMany.mockResolvedValue({ count: 1 });

    const out = await revealSurpriseAuctionDrawForOrder("o1");
    expect(out).toEqual({ label: "Pack (2 of 2)" });
    expect(hoisted.emitSpin).toHaveBeenCalledWith("room1", expect.objectContaining({ spinId: "auction-d1" }));
    expect(prismaMock.liveRoomMessage.create).toHaveBeenCalled();
    expect(hoisted.emitQueue).toHaveBeenCalledWith("room1");
  });

  it("retries when another order grabbed the same unit", async () => {
    prismaMock.surpriseAuctionDraw.findUnique.mockResolvedValue({
      id: "d1",
      liveRoomItemId: "item1",
      revealedLabel: null,
      buyer: { username: "bob" },
    });
    prismaMock.liveRoomItem.findUnique.mockResolvedValue(item());
    hoisted.assigned
      .mockResolvedValueOnce(new Set(["chase (1 of 1)", "pack (1 of 2)"]))
      .mockResolvedValueOnce(new Set(["chase (1 of 1)", "pack (2 of 2)"]));
    prismaMock.surpriseAuctionDraw.updateMany
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
      .mockResolvedValueOnce({ count: 1 });

    expect(await revealSurpriseAuctionDrawForOrder("o1")).toEqual({ label: "Pack (1 of 2)" });
    expect(prismaMock.surpriseAuctionDraw.updateMany).toHaveBeenCalledTimes(2);
  });

  it("alerts ops instead of throwing when the set is exhausted", async () => {
    prismaMock.surpriseAuctionDraw.findUnique.mockResolvedValue({
      id: "d1",
      liveRoomItemId: "item1",
      revealedLabel: null,
      buyer: { username: "bob" },
    });
    prismaMock.liveRoomItem.findUnique.mockResolvedValue(item());
    hoisted.assigned.mockResolvedValue(new Set(LABELS.map((l) => l.toLowerCase())));
    expect(await revealSurpriseAuctionDrawForOrder("o1")).toBeNull();
    expect(hoisted.anomaly).toHaveBeenCalledWith("surprise-auction-reveal", expect.stringContaining("o1"));
  });
});

describe("releaseSurpriseAuctionDrawForCancelledOrder", () => {
  it("returns the unit and re-queues a sold-out set", async () => {
    prismaMock.surpriseAuctionDraw.findUnique.mockResolvedValue({ id: "d1", liveRoomItemId: "item1", revealedLabel: null });
    prismaMock.surpriseAuctionDraw.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.liveRoomItem.findUnique.mockResolvedValue({ status: "sold", quantity: 0, liveRoomId: "room1" });
    expect(await releaseSurpriseAuctionDrawForCancelledOrder(prismaMock as never, "o1")).toBe(true);
    expect(prismaMock.liveRoomItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 1, status: "queued" }) }),
    );
  });

  it("adds the unit back to an item still running", async () => {
    prismaMock.surpriseAuctionDraw.findUnique.mockResolvedValue({ id: "d1", liveRoomItemId: "item1", revealedLabel: null });
    prismaMock.surpriseAuctionDraw.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.liveRoomItem.findUnique.mockResolvedValue({ status: "active", quantity: 4, liveRoomId: "room1" });
    await releaseSurpriseAuctionDrawForCancelledOrder(prismaMock as never, "o1");
    const data = prismaMock.liveRoomItem.update.mock.calls[0]![0].data;
    expect(data.quantity).toBe(5);
    expect(data.status).toBeUndefined();
  });

  it("never releases an already-revealed draw", async () => {
    prismaMock.surpriseAuctionDraw.findUnique.mockResolvedValue({ id: "d1", liveRoomItemId: "item1", revealedLabel: "Chase (1 of 1)" });
    expect(await releaseSurpriseAuctionDrawForCancelledOrder(prismaMock as never, "o1")).toBe(false);
    expect(prismaMock.surpriseAuctionDraw.deleteMany).not.toHaveBeenCalled();
  });
});
