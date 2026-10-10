import { NextResponse } from "next/server";
import { normalizeAdminReason } from "@/lib/admin/admin-audit";
import { releaseSpot, reassignSpotBuyer, SpotFixError } from "@/lib/admin/admin-spot-fix";
import { requireAdminPermission } from "@/lib/admin/admin-permissions";

type Body = { action?: string; reason?: string; toUsername?: string; acknowledgePaidOnPlatform?: boolean };

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("spots.fix", request);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reason = normalizeAdminReason(body.reason);
  if (!reason) return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });

  try {
    if (body.action === "reassign") {
      if (!body.toUsername?.trim()) return NextResponse.json({ error: "toUsername required" }, { status: 400 });
      const result = await reassignSpotBuyer({
        adminUserId: gate.userId,
        purchaseId: id,
        toUsername: body.toUsername,
        reason,
        acknowledgePaidOnPlatform: body.acknowledgePaidOnPlatform === true,
      });
      return NextResponse.json({ ok: true, ...result });
    }
    if (body.action === "release") {
      const result = await releaseSpot({ adminUserId: gate.userId, purchaseId: id, reason });
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    if (e instanceof SpotFixError) return NextResponse.json({ error: e.code }, { status: e.status });
    console.error("[admin spots PATCH]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
