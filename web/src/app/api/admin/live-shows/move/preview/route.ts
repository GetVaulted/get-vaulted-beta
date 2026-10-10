import { NextResponse } from "next/server";
import { planShowMove } from "@/lib/admin/admin-show-move";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

/** Dry run for the move-items tool. Never changes data. */
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  const sp = new URL(request.url).searchParams;
  const from = sp.get("from")?.trim() ?? "";
  const to = sp.get("to")?.trim() ?? "";
  if (!from || !to) return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  const items = (sp.get("items") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const plan = await planShowMove({
    fromRoomId: from,
    toRoomId: to,
    itemIds: items.length > 0 ? items : null,
    linkContinuation: sp.get("link") !== "0",
  });
  if ("error" in plan) return NextResponse.json({ error: plan.error }, { status: 404 });
  return NextResponse.json({ plan });
}
