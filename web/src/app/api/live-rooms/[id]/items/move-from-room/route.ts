import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";
import { executeShowMove, planShowMove, ShowMoveError } from "@/lib/admin/admin-show-move";

type PostBody = {
  sourceRoomId?: unknown;
  itemIds?: unknown;
  /** false/omitted = preview only (nothing is written). true = do the move (needs `expect`). */
  confirm?: unknown;
  expect?: { items?: unknown; paidSpots?: unknown; pendingSpots?: unknown; buyers?: unknown };
};

/**
 * POST /api/live-rooms/[id]/items/move-from-room
 *
 * Seller self-service version of the admin "move items between shows" tool: carries the seller's
 * lots **and their sold spots (buyers, payments)** from an ENDED show of theirs into this show.
 * Nothing is copied: the lots and purchases are re-pointed at this show, so nothing is double-counted.
 *
 * Limits (enforced in `planShowMove({ sellerMode: true })`): both shows must be the same seller's, the
 * old show must have ended, only lots the seller picked that actually have sold spots, nothing still
 * waiting on payment, no auction bids, and no break that already started. Every move is audit-logged.
 *
 * Call once without `confirm` to get the preview (and the list of movable lots), then again with
 * `confirm: true` and the preview's totals as `expect`. If anything changed in between, the server
 * refuses with 409 so the seller can look again.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;
  const { room, userId } = hostAuth;

  if (room.status === "ended") {
    return NextResponse.json({ error: "This show has ended. You cannot move spots into it." }, { status: 409 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sourceRoomId = typeof body.sourceRoomId === "string" ? body.sourceRoomId.trim() : "";
  if (!sourceRoomId) return NextResponse.json({ error: "sourceRoomId is required." }, { status: 400 });
  if (sourceRoomId === liveRoomId) {
    return NextResponse.json({ error: "Pick a different show to move from." }, { status: 400 });
  }

  // Only ever the same seller's own show. Say "not found" so another seller's shows aren't revealed.
  const source = await prisma.liveRoom.findFirst({
    where: { id: sourceRoomId, sellerId: room.sellerId },
    select: { id: true },
  });
  if (!source) return NextResponse.json({ error: "Source show not found." }, { status: 404 });

  const itemIds = Array.isArray(body.itemIds)
    ? body.itemIds.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, 200)
    : [];

  const plan = await planShowMove({
    fromRoomId: sourceRoomId,
    toRoomId: liveRoomId,
    itemIds: itemIds.length > 0 ? itemIds : null,
    linkContinuation: true,
    sellerMode: true,
  });
  if ("error" in plan) return NextResponse.json({ error: "Show not found." }, { status: 404 });

  const preview = {
    from: { id: plan.from.id, title: plan.from.title, status: plan.from.status },
    to: { id: plan.to.id, title: plan.to.title, status: plan.to.status },
    items: plan.items.map((i) => ({
      id: i.id,
      title: i.title,
      paidSpots: i.paidSpots,
      pendingSpots: i.pendingSpots,
      bids: i.bids,
      moving: i.moving,
    })),
    buyers: plan.buyers.map((b) => ({ username: b.username, spots: b.spots })),
    totals: plan.totals,
    willLinkContinuation: plan.willLinkContinuation,
    blockers: plan.blockers,
    warnings: plan.warnings,
  };

  if (body.confirm !== true) return NextResponse.json({ ok: true, preview });

  const e = body.expect;
  if (
    !e ||
    typeof e.items !== "number" ||
    typeof e.paidSpots !== "number" ||
    typeof e.pendingSpots !== "number" ||
    typeof e.buyers !== "number"
  ) {
    return NextResponse.json({ error: "Review the preview first, then confirm." }, { status: 400 });
  }

  try {
    const result = await executeShowMove({
      adminUserId: userId,
      sellerMode: true,
      fromRoomId: sourceRoomId,
      toRoomId: liveRoomId,
      itemIds,
      linkContinuation: true,
      reason: "Seller moved their sold spots to a new show",
      expect: { items: e.items, paidSpots: e.paidSpots, pendingSpots: e.pendingSpots, buyers: e.buyers },
    });
    emitLiveRoomQueueItemsChanged(liveRoomId);
    emitLiveRoomQueueItemsChanged(sourceRoomId);
    return NextResponse.json({ ok: true, ...result, sourceTitle: plan.from.title });
  } catch (err) {
    if (err instanceof ShowMoveError) {
      if (err.code === "BLOCKED") {
        const first = Array.isArray(err.detail) ? String(err.detail[0] ?? "") : "";
        return NextResponse.json({ error: first || "That move isn't allowed.", blockers: err.detail ?? [] }, { status: 400 });
      }
      if (err.code === "PLAN_CHANGED") {
        return NextResponse.json(
          { error: "Something changed while you were reviewing. Look at the preview again, then confirm.", totals: err.detail ?? null },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error("[api POST /api/live-rooms/[id]/items/move-from-room] failed", { liveRoomId, sourceRoomId, err });
    return NextResponse.json({ error: "Could not move the spots. Nothing was changed." }, { status: 500 });
  }
}
