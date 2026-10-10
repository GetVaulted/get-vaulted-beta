import { NextResponse } from "next/server";
import { logAdminActionSafe, normalizeAdminReason } from "@/lib/admin/admin-audit";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { requireAdminPermission } from "@/lib/admin/admin-permissions";
import { adminOpenRefundRequest, RefundRequestError } from "@/services/order-refund-request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Refund/cancel requests on one order (any status), newest first. */
export async function GET(_req: Request, ctx: Ctx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const rows = await prisma.orderRefundRequest.findMany({
    where: { orderId: decodeURIComponent(id) },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, kind: true, status: true, reason: true, createdAt: true, refundedAt: true },
  });
  return NextResponse.json({
    requests: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      refundedAt: r.refundedAt?.toISOString() ?? null,
    })),
  });
}

/**
 * Support opens a cancel/return request on a buyer's behalf. It lands in the escalated queue;
 * nothing is refunded until an admin accepts it there.
 */
export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireAdminPermission("refunds.decide");
  if (!gate.ok) return gate.response;
  const { id: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw);

  let body: { kind?: string; reason?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reason = normalizeAdminReason(body.reason);
  if (!reason) return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });
  if (body.kind !== "cancel" && body.kind !== "return") {
    return NextResponse.json({ error: "kind must be cancel or return" }, { status: 400 });
  }

  try {
    const request = await adminOpenRefundRequest({ orderId, adminUserId: gate.userId, kind: body.kind, reason });
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { buyerId: true } });
    await logAdminActionSafe({
      adminUserId: gate.userId,
      action: "refund.open",
      targetType: "order",
      targetId: orderId,
      targetUserId: order?.buyerId ?? null,
      reason,
      detail: { requestId: request.id, kind: body.kind },
    });
    return NextResponse.json({ request });
  } catch (e) {
    if (e instanceof RefundRequestError) return NextResponse.json({ error: e.code }, { status: e.status });
    console.error("[admin order refund-request POST]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
