import { NextResponse } from "next/server";
import { executeShowMove, planShowMove, ShowMoveError, type MovePlan } from "@/lib/admin/admin-show-move";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";

export const dynamic = "force-dynamic";

type PostBody = {
  sourceRoomId?: string;
  /** true = dry run (returns the plan, changes nothing). */
  preview?: boolean;
  /** Totals the seller saw in the preview; required to actually move. */
  expect?: { items?: number; paidSpots?: number; pendingSpots?: number; buyers?: number };
};

/** What the seller sees before confirming (no buyer ids/amounts). */
function sellerMovePreview(plan: MovePlan) {
  return {
    from: { id: plan.from.id, title: plan.from.title, status: plan.from.status },
    to: { id: plan.to.id, title: plan.to.title, status: plan.to.status },
    items: plan.items
      .filter((i) => i.moving)
      .map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        paidSpots: i.paidSpots,
        pendingSpots: i.pendingSpots,
        bids: i.bids,
      })),
    totals: plan.totals,
    willLinkContinuation: plan.willLinkContinuation,
    blockers: plan.blockers,
    warnings: plan.warnings,
  };
}

const ERROR_COPY: Record<string, string> = {
  FROM_NOT_FOUND: "That show wasn't found.",
  TO_NOT_FOUND: "This show wasn't found.",
  PLAN_CHANGED: "Something changed in that show since you previewed (a sale or edit). Preview again.",
};

/**
 * POST /api/live-rooms/[id]/items/move-from-room
 * Seller version of the admin "move items between shows" tool: moves the lots from one of the
 * seller's previous shows into this show — sold spots, pending spots and bids go with them — and
 * links this show as a continuation of the old one so each buyer's shipping cap carries over.
 * Two steps: `preview: true` first, then the same call with `expect` set to the previewed totals.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;
  const { room, userId } = hostAuth;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sourceRoomId = typeof body.sourceRoomId === "string" ? body.sourceRoomId.trim() : "";
  if (!sourceRoomId) return NextResponse.json({ error: "Pick a previous show." }, { status: 400 });
  if (sourceRoomId === liveRoomId) {
    return NextResponse.json({ error: "Pick a different show to move from." }, { status: 400 });
  }

  const plan = await planShowMove({ fromRoomId: sourceRoomId, toRoomId: liveRoomId });
  if ("error" in plan) return NextResponse.json({ error: ERROR_COPY[plan.error] ?? plan.error }, { status: 404 });
  // Only the seller's own shows (an admin hosting on their behalf passes the same check).
  if (plan.from.sellerId !== room.sellerId) {
    return NextResponse.json({ error: "That show wasn't found." }, { status: 404 });
  }

  if (body.preview === true) {
    return NextResponse.json({ preview: sellerMovePreview(plan) });
  }

  const e = body.expect;
  if (!e || ![e.items, e.paidSpots, e.pendingSpots, e.buyers].every((n) => typeof n === "number")) {
    return NextResponse.json({ error: "Preview the move first." }, { status: 400 });
  }
  if (plan.blockers.length > 0) {
    return NextResponse.json({ error: plan.blockers[0], blockers: plan.blockers }, { status: 400 });
  }

  try {
    const result = await executeShowMove({
      adminUserId: userId,
      auditAction: "show.move_items.seller",
      fromRoomId: plan.from.id,
      toRoomId: plan.to.id,
      itemIds: null,
      linkContinuation: true,
      reason: "Seller moved items from a previous show",
      expect: { items: e.items!, paidSpots: e.paidSpots!, pendingSpots: e.pendingSpots!, buyers: e.buyers! },
    });
    emitLiveRoomQueueItemsChanged(plan.to.id);
    emitLiveRoomQueueItemsChanged(plan.from.id);
    return NextResponse.json({
      ok: true,
      moved: result.moved,
      linkedContinuation: result.linkedContinuation,
      sourceTitle: plan.from.title,
    });
  } catch (err) {
    if (err instanceof ShowMoveError) {
      const detail = Array.isArray(err.detail) ? (err.detail as string[]) : null;
      const msg = err.code === "BLOCKED" && detail?.[0] ? detail[0] : ERROR_COPY[err.code] ?? "Could not move those items.";
      return NextResponse.json({ error: msg, code: err.code }, { status: err.status });
    }
    console.error("[seller show move]", { liveRoomId, sourceRoomId, err });
    return NextResponse.json({ error: "Could not move those items. Try again." }, { status: 500 });
  }
}
