import { NextResponse } from "next/server";
import { normalizeAdminReason } from "@/lib/admin/admin-audit";
import { sendAdminMessage, SupportToolError } from "@/lib/admin/admin-support";
import { requireAdmin } from "@/lib/require-admin";

/** POST { title, body, href?, reason } — send one member an in-app message/push from support. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;

  let body: { title?: string; body?: string; href?: string; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reason = normalizeAdminReason(body.reason);
  if (!reason) return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });

  try {
    const result = await sendAdminMessage({
      adminUserId: gate.userId,
      userId: decodeURIComponent(id),
      title: body.title ?? "",
      body: body.body ?? "",
      href: body.href,
      reason,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof SupportToolError) return NextResponse.json({ error: e.code }, { status: e.status });
    console.error("[admin message user]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
