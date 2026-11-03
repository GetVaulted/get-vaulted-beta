import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { liveRoom: { findFirst: (...a: unknown[]) => findFirst(...a) } } }));

const requireHost = vi.fn();
vi.mock("@/lib/resolve-live-room-host-user", () => ({
  requireLiveRoomHostUser: (...a: unknown[]) => requireHost(...a),
}));

const emit = vi.fn();
vi.mock("@/lib/realtime-emit-server", () => ({ emitLiveRoomQueueItemsChanged: (...a: unknown[]) => emit(...a) }));

const planShowMove = vi.fn();
const executeShowMove = vi.fn();
vi.mock("@/lib/admin/admin-show-move", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/admin-show-move")>("@/lib/admin/admin-show-move");
  return { ...actual, planShowMove: (...a: unknown[]) => planShowMove(...a), executeShowMove: (...a: unknown[]) => executeShowMove(...a) };
});

import { ShowMoveError } from "@/lib/admin/admin-show-move";
import { POST } from "./route";

const plan = (over: Record<string, unknown> = {}) => ({
  from: { id: "old", title: "Friday break", status: "ended" },
  to: { id: "new", title: "Saturday break", status: "scheduled" },
  items: [{ id: "i1", title: "NFL PYT", paidSpots: 3, pendingSpots: 0, bids: 0, moving: true, status: "sold", sortOrder: 0 }],
  buyers: [{ buyerId: "b1", username: "kem", spots: 3, paidUsd: 45, shippingInOldShow: null, hasSessionInNewShow: false }],
  totals: { items: 1, paidSpots: 3, pendingSpots: 0, bids: 0, buyers: 1 },
  willLinkContinuation: true,
  blockers: [],
  warnings: [],
  ...over,
});

const call = (body: unknown) =>
  POST(new Request("http://x/api", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "new" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireHost.mockResolvedValue({ userId: "u1", isAdmin: false, room: { id: "new", sellerId: "s1", status: "scheduled" } });
  findFirst.mockResolvedValue({ id: "old" });
  planShowMove.mockResolvedValue(plan());
  executeShowMove.mockResolvedValue({ moved: { items: 1, purchases: 3 }, linkedContinuation: true });
});

describe("POST move-from-room", () => {
  it("previews without writing and without exposing buyer ids", async () => {
    const res = await call({ sourceRoomId: "old", itemIds: ["i1"] });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.preview.totals.paidSpots).toBe(3);
    expect(j.preview.buyers).toEqual([{ username: "kem", spots: 3 }]);
    expect(executeShowMove).not.toHaveBeenCalled();
    expect(planShowMove).toHaveBeenCalledWith(expect.objectContaining({ sellerMode: true, itemIds: ["i1"] }));
  });

  it("only looks up the seller's own shows, and hides other sellers' shows", async () => {
    findFirst.mockResolvedValueOnce(null);
    const res = await call({ sourceRoomId: "someone-elses" });
    expect(res.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "someone-elses", sellerId: "s1" } }));
    expect(planShowMove).not.toHaveBeenCalled();
  });

  it("refuses to move into an ended show", async () => {
    requireHost.mockResolvedValueOnce({ userId: "u1", isAdmin: false, room: { id: "new", sellerId: "s1", status: "ended" } });
    expect((await call({ sourceRoomId: "old" })).status).toBe(409);
  });

  it("needs the reviewed totals to confirm", async () => {
    const res = await call({ sourceRoomId: "old", itemIds: ["i1"], confirm: true });
    expect(res.status).toBe(400);
    expect(executeShowMove).not.toHaveBeenCalled();
  });

  it("moves in seller mode, logs the actor, and refreshes both shows", async () => {
    const res = await call({
      sourceRoomId: "old",
      itemIds: ["i1"],
      confirm: true,
      expect: { items: 1, paidSpots: 3, pendingSpots: 0, buyers: 1 },
    });
    expect(res.status).toBe(200);
    expect(executeShowMove).toHaveBeenCalledWith(
      expect.objectContaining({ sellerMode: true, adminUserId: "u1", fromRoomId: "old", toRoomId: "new", itemIds: ["i1"] }),
    );
    expect(emit).toHaveBeenCalledWith("new");
    expect(emit).toHaveBeenCalledWith("old");
  });

  it("explains a changed plan and a blocked move", async () => {
    executeShowMove.mockRejectedValueOnce(new ShowMoveError("PLAN_CHANGED", 409, { paidSpots: 4 }));
    const changed = await call({ sourceRoomId: "old", itemIds: ["i1"], confirm: true, expect: { items: 1, paidSpots: 3, pendingSpots: 0, buyers: 1 } });
    expect(changed.status).toBe(409);
    executeShowMove.mockRejectedValueOnce(new ShowMoveError("BLOCKED", 400, ["2 spot(s) are still waiting on payment."]));
    const blocked = await call({ sourceRoomId: "old", itemIds: ["i1"], confirm: true, expect: { items: 1, paidSpots: 3, pendingSpots: 0, buyers: 1 } });
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).error).toContain("waiting on payment");
  });

  it("passes through auth failures", async () => {
    requireHost.mockResolvedValueOnce(new NextResponse(JSON.stringify({ error: "no" }), { status: 403 }));
    expect((await call({ sourceRoomId: "old" })).status).toBe(403);
  });
});
