import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  host: vi.fn(),
  plan: vi.fn(),
  exec: vi.fn(),
  emit: vi.fn(),
}));

vi.mock("@/lib/resolve-live-room-host-user", () => ({ requireLiveRoomHostUser: h.host }));
vi.mock("@/lib/realtime-emit-server", () => ({ emitLiveRoomQueueItemsChanged: h.emit }));
vi.mock("@/lib/admin/admin-show-move", () => {
  class ShowMoveError extends Error {
    constructor(
      public code: string,
      public status: number,
      public detail?: unknown,
    ) {
      super(code);
    }
  }
  return { planShowMove: h.plan, executeShowMove: h.exec, ShowMoveError };
});

import { POST } from "./route";

const totals = { items: 2, paidSpots: 5, pendingSpots: 0, bids: 0, buyers: 3 };
function plan(over: Record<string, unknown> = {}) {
  return {
    from: { id: "old", title: "Old show", status: "ended", sellerId: "s1" },
    to: { id: "new", title: "New show", status: "scheduled", sellerId: "s1" },
    items: [
      { id: "i1", title: "Lot A", status: "queued", sortOrder: 0, paidSpots: 5, pendingSpots: 0, bids: 0, moving: true },
    ],
    buyers: [{ buyerId: "b1", username: "x", spots: 5, paidUsd: 50 }],
    totals,
    willLinkContinuation: true,
    blockers: [],
    warnings: [],
    ...over,
  };
}
const call = (body: unknown) =>
  POST(new Request("http://x/api", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "new" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.host.mockResolvedValue({ userId: "s1", isAdmin: false, room: { id: "new", sellerId: "s1", status: "scheduled" } });
  h.plan.mockResolvedValue(plan());
  h.exec.mockResolvedValue({ moved: { items: 2, purchases: 5 }, linkedContinuation: true });
});

describe("POST move-from-room", () => {
  it("previews without moving and hides buyer details", async () => {
    const res = await call({ sourceRoomId: "old", preview: true });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.preview.totals).toEqual(totals);
    expect(j.preview.buyers).toBeUndefined();
    expect(h.exec).not.toHaveBeenCalled();
  });

  it("moves with the previewed totals, links shipping and refreshes both shows", async () => {
    const res = await call({ sourceRoomId: "old", expect: totals });
    expect(res.status).toBe(200);
    expect(h.exec).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "s1",
        auditAction: "show.move_items.seller",
        fromRoomId: "old",
        toRoomId: "new",
        linkContinuation: true,
        expect: { items: 2, paidSpots: 5, pendingSpots: 0, buyers: 3 },
      }),
    );
    expect(h.emit).toHaveBeenCalledWith("new");
    expect(h.emit).toHaveBeenCalledWith("old");
  });

  it("requires a preview first", async () => {
    const res = await call({ sourceRoomId: "old" });
    expect(res.status).toBe(400);
    expect(h.exec).not.toHaveBeenCalled();
  });

  it("refuses another seller's show", async () => {
    h.plan.mockResolvedValue(plan({ from: { id: "old", title: "x", status: "ended", sellerId: "other" } }));
    const res = await call({ sourceRoomId: "old", preview: true });
    expect(res.status).toBe(404);
  });

  it("refuses when the plan has blockers", async () => {
    h.plan.mockResolvedValue(plan({ blockers: ["The old show is live right now. End it first, then move items."] }));
    const res = await call({ sourceRoomId: "old", expect: totals });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/live right now/);
    expect(h.exec).not.toHaveBeenCalled();
  });

  it("passes through host auth failures", async () => {
    h.host.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await call({ sourceRoomId: "old", preview: true });
    expect(res.status).toBe(403);
  });
});
