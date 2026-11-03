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

function fakeDb(
  opts: {
    from?: Record<string, unknown>;
    to?: Record<string, unknown>;
    chainLoop?: boolean;
    items?: Record<string, unknown>[];
    purchases?: Record<string, unknown>[];
    bids?: { liveRoomItemId: string; _count: number }[];
  } = {},
) {
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
      findMany: vi.fn(
        async () =>
          opts.items ?? [
            { id: "i1", title: "Case break", status: "sold", sortOrder: 0 },
            { id: "i2", title: "Hobby box", status: "queued", sortOrder: 1 },
          ],
      ),
    },
    liveItemVariantPurchase: {
      findMany: vi.fn(
        async () =>
          opts.purchases ?? [
            { liveRoomItemId: "i1", buyerId: "b1", paymentStatus: "paid", totalUsd: 15, buyer: { username: "kem" } },
            { liveRoomItemId: "i1", buyerId: "b1", paymentStatus: "paid", totalUsd: 15, buyer: { username: "kem" } },
            { liveRoomItemId: "i1", buyerId: "b2", paymentStatus: "pending_payment", totalUsd: 15, buyer: { username: "bo" } },
            { liveRoomItemId: "i1", buyerId: "b3", paymentStatus: "cancelled", totalUsd: 15, buyer: { username: "gone" } },
          ],
      ),
    },
    liveRoomBid: { groupBy: vi.fn(async () => opts.bids ?? []) },
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

describe("planShowMove seller mode", () => {
  const paidOnly = [
    { liveRoomItemId: "i1", buyerId: "b1", paymentStatus: "paid", totalUsd: 15, buyer: { username: "kem" } },
    { liveRoomItemId: "i1", buyerId: "b2", paymentStatus: "paid", totalUsd: 15, buyer: { username: "bo" } },
  ];
  const plan = async (db: ReturnType<typeof fakeDb>, itemIds: string[] | null) => {
    const p = await planShowMove({ fromRoomId: "r_old", toRoomId: "r_new", itemIds, sellerMode: true }, db);
    if ("error" in p) throw new Error(p.error);
    return p;
  };

  it("allows a clean move of a lot with paid spots from an ended show", async () => {
    const p = await plan(fakeDb({ purchases: paidOnly }), ["i1"]);
    expect(p.blockers).toEqual([]);
    expect(p.totals).toMatchObject({ items: 1, paidSpots: 2, pendingSpots: 0, buyers: 2 });
  });

  it("makes the seller pick lots instead of moving everything", async () => {
    const p = await plan(fakeDb({ purchases: paidOnly }), null);
    expect(p.blockers.join(" ")).toContain("Pick the lots");
  });

  it("blocks spots still waiting on payment", async () => {
    const p = await plan(fakeDb(), ["i1"]);
    expect(p.blockers.join(" ")).toContain("waiting on payment");
  });

  it("blocks a lot with no sold spots", async () => {
    const p = await plan(fakeDb({ purchases: paidOnly }), ["i2"]);
    expect(p.blockers.join(" ")).toContain("no sold spots");
  });

  it("blocks a show that has not ended, auction bids, and a break that already started", async () => {
    const live = await plan(fakeDb({ purchases: paidOnly, from: { status: "scheduled" } }), ["i1"]);
    expect(live.blockers.join(" ")).toContain("has ended");
    const bids = await plan(fakeDb({ purchases: paidOnly, bids: [{ liveRoomItemId: "i1", _count: 2 }] }), ["i1"]);
    expect(bids.blockers.join(" ")).toContain("auction bid");
    const began = await plan(
      fakeDb({
        purchases: paidOnly,
        items: [{ id: "i1", title: "Case break", status: "sold", sortOrder: 0, variantBreakBeganAt: new Date() }],
      }),
      ["i1"],
    );
    expect(began.blockers.join(" ")).toContain("already started");
  });

  it("does not apply the seller limits to the admin tool", async () => {
    const p = await planShowMove({ fromRoomId: "r_old", toRoomId: "r_new" }, fakeDb());
    if ("error" in p) throw new Error(p.error);
    expect(p.blockers).toEqual([]);
  });
});
