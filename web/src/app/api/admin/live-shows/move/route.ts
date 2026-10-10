import { NextResponse } from "next/server";
import { normalizeAdminReason } from "@/lib/admin/admin-audit";
import { executeShowMove, ShowMoveError } from "@/lib/admin/admin-show-move";
import { requireAdminPermission } from "@/lib/admin/admin-permissions";

type Body = {
  fromRoomId?: string;
  toRoomId?: string;
  itemIds?: string[] | null;
  linkContinuation?: boolean;
  reason?: string;
  expect?: { items?: number; paidSpots?: number; pendingSpots?: number; buyers?: number };
};

/** Move lots + sold spots from one show to another, then link shipping. One transaction. */
export async function POST(request: Request) {
  const gate = await requireAdminPermission("shows.move", request);
  if (!gate.ok) return gate.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reason = normalizeAdminReason(body.reason);
  if (!reason) return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });
  const e = body.expect;
  if (
    !body.fromRoomId ||
    !body.toRoomId ||
    !e ||
    ![e.items, e.paidSpots, e.pendingSpots, e.buyers].every((n) => typeof n === "number")
  ) {
    return NextResponse.json({ error: "fromRoomId, toRoomId and the previewed totals are required" }, { status: 400 });
  }

  try {
    const result = await executeShowMove({
      adminUserId: gate.userId,
      fromRoomId: body.fromRoomId,
      toRoomId: body.toRoomId,
      itemIds: Array.isArray(body.itemIds) && body.itemIds.length > 0 ? body.itemIds : null,
      linkContinuation: body.linkContinuation !== false,
      reason,
      expect: { items: e.items!, paidSpots: e.paidSpots!, pendingSpots: e.pendingSpots!, buyers: e.buyers! },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ShowMoveError) {
      return NextResponse.json({ error: err.code, detail: err.detail ?? null }, { status: err.status });
    }
    console.error("[admin show move]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
