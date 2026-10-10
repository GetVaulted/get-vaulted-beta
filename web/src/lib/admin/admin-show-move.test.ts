import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { planShowMove } from "./admin-show-move";

const room = (over: Record<string, unknown> = {}) => ({
  id: "r_old",
  title: "Old show",
  status: "ended",
  sellerId: "s1",
  seller: { username: "daly" },
  scheduledStartAt: null,
  continuationOfLiveRoomId: null,
  shippingMode: "capped",
  shippingCapEnabled: true,
  shippingCapCents: 1500,
  freeShippingEnabled: false,
  sellerPaysOverCap: true,
  ...over,
});

function fakeDb(opts: { from?: Record<string, unknown>; to?: Record<string, unknown>; chainLoop?: boolean } = {}) {
  const from = room(opts.from);
  const to = room({ id: "r_new", title: "New show", status: "scheduled", ...opts.to });
  const rooms: Record<string, ReturnType<typeof room>> = { [from.id]: from, [to.id]: to };
  return {
    liveRoom: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const r = rooms[where.id];
        if (!r) return null;
        return opts.chainLoop && where.id === "r_old" ? { ...r, continuationOfLiveRoomId: "r_new" } : r;
      }),
    },
    liveRoomItem: {
      findMany: vi.fn(async () => [
        { id: "i1", title: "Case break", status: "sold", sortOrder: 0 },
        { id: "i2", title: "Hobby box", status: "queued", sortOrder: 1 },
      ]),
    },
    liveItemVariantPurchase: {
      findMany: vi.fn(async () => [
        { liveRoomItemId: "i1", buyerId: "b1", paymentStatus: "paid", totalUsd: 15, buyer: { username: "kem" } },
        { liveRoomItemId: "i1", buyerId: "b1", paymentStatus: "paid", totalUsd: 15, buyer: { username: "kem" } },
        { liveRoomItemId: "i1", buyerId: "b2", paymentStatus: "pending_payment", totalUsd: 15, buyer: { username: "bo" } },
        { liveRoomItemId: "i1", buyerId: "b3", paymentStatus: "cancelled", totalUsd: 15, buyer: { username: "gone" } },
      ]),
    },
    liveRoomBid: { groupBy: vi.fn(async () => []) },
    liveShippingSession: {
      findMany: vi.fn(async ({ where }: { where: { liveShowId: string } }) =>
        where.liveShowId === "r_old"
          ? [{ buyerId: "b1", shippingChargedCents: 500, capReached: false, _count: { orders: 1 } }]
          : [],
      ),
    },
    liveRoomTeamBoard: { findUnique: vi.fn(async () => null) },
    breakSpot: { count: vi.fn(async () => 0) },
  } as never;
}

describe("planShowMove", () => {
  it("summarises items, buyers and shipping, ignoring cancelled spots", async () => {
    const plan = await planShowMove({ fromRoomId: "r_old", toRoomId: "r_new" }, fakeDb());
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.blockers).toEqual([]);
    expect(plan.totals).toMatchObject({ items: 2, paidSpots: 2, pendingSpots: 1, buyers: 2 });
    expect(plan.willLinkContinuation).toBe(true);
    const kem = plan.buyers.find((b) => b.username === "kem");
    expect(kem?.shippingInOldShow).toEqual({ orders: 1, chargedCents: 500, capReached: false });
    expect(plan.warnings.join(" ")).toContain("waiting on payment");
  });

  it("blocks different sellers, a live old show, and an ended new show", async () => {
    const plan = await planShowMove(
      { fromRoomId: "r_old", toRoomId: "r_new" },
      fakeDb({ from: { status: "live" }, to: { sellerId: "s2", seller: { username: "other" }, status: "ended" } }),
    );
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.blockers.length).toBe(3);
  });

  it("blocks a link that would create a loop", async () => {
    const plan = await planShowMove({ fromRoomId: "r_old", toRoomId: "r_new" }, fakeDb({ chainLoop: true }));
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.blockers.join(" ")).toContain("loop");
    expect(plan.willLinkContinuation).toBe(false);
  });

  it("warns when shipping settings differ and when the new show is linked elsewhere", async () => {
    const plan = await planShowMove(
      { fromRoomId: "r_old", toRoomId: "r_new" },
      fakeDb({ to: { shippingCapCents: 999, continuationOfLiveRoomId: "r_other" } }),
    );
    if ("error" in plan) throw new Error(plan.error);
    const text = plan.warnings.join(" ");
    expect(text).toContain("different shipping settings");
    expect(text).toContain("different show");
    expect(plan.willLinkContinuation).toBe(false);
  });

  it("returns an error for a missing show", async () => {
    const db = fakeDb();
    (db as never as { liveRoom: { findUnique: ReturnType<typeof vi.fn> } }).liveRoom.findUnique.mockResolvedValueOnce(null);
    const plan = await planShowMove({ fromRoomId: "nope", toRoomId: "r_new" }, db);
    expect(plan).toEqual({ error: "FROM_NOT_FOUND" });
  });
});
