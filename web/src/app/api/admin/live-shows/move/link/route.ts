import { NextResponse } from "next/server";
import { normalizeAdminReason } from "@/lib/admin/admin-audit";
import { linkShowContinuation, ShowMoveError } from "@/lib/admin/admin-show-move";
import { requireAdminPermission } from "@/lib/admin/admin-permissions";

/** Link a new show as the continuation of an old one (shipping caps carry forward). No items move. */
export async function POST(request: Request) {
  const gate = await requireAdminPermission("shows.move", request);
  if (!gate.ok) return gate.response;

  let body: { fromRoomId?: string; toRoomId?: string; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reason = normalizeAdminReason(body.reason);
  if (!reason) return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });
  if (!body.fromRoomId || !body.toRoomId) {
    return NextResponse.json({ error: "fromRoomId and toRoomId are required" }, { status: 400 });
  }

  try {
    const result = await linkShowContinuation({
      adminUserId: gate.userId,
      fromRoomId: body.fromRoomId,
      toRoomId: body.toRoomId,
      reason,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ShowMoveError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[admin show link]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
