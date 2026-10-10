import { NextResponse } from "next/server";
import { normalizeAdminReason } from "@/lib/admin/admin-audit";
import { adminFixOrderFulfillment, OrderFixError, type FulfillmentAction } from "@/lib/admin/admin-order-fulfillment";
import { requireAdminPermission } from "@/lib/admin/admin-permissions";

type Body = { action?: string; carrier?: string; trackingNumber?: string; reason?: string };
const ACTIONS: FulfillmentAction[] = ["set_tracking", "mark_shipped", "mark_delivered"];

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("orders.fulfill", request);
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
  if (!ACTIONS.includes(body.action as FulfillmentAction)) {
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  }

  try {
    await adminFixOrderFulfillment({
      adminUserId: gate.userId,
      orderId: decodeURIComponent(id),
      action: body.action as FulfillmentAction,
      carrier: body.carrier,
      trackingNumber: body.trackingNumber,
      reason,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OrderFixError) return NextResponse.json({ error: e.code }, { status: e.status });
    console.error("[admin order fulfillment]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
