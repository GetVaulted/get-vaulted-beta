import { NextResponse } from "next/server";
import { normalizeAdminReason } from "@/lib/admin/admin-audit";
import { ModerationError, setReviewHidden } from "@/lib/admin/admin-content-moderation";
import { requireAdminPermission } from "@/lib/admin/admin-permissions";

/** PATCH { action: "hide" | "restore", reason } */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("content.moderate", request);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;

  let body: { action?: string; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reason = normalizeAdminReason(body.reason);
  if (!reason) return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });
  if (body.action !== "hide" && body.action !== "restore") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  try {
    const result = await setReviewHidden({
      adminUserId: gate.userId,
      reviewId: decodeURIComponent(id),
      hidden: body.action === "hide",
      reason,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ModerationError) return NextResponse.json({ error: e.code }, { status: e.status });
    console.error("[admin reviews PATCH]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
