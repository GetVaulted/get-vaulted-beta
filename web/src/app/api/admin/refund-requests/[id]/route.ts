import { NextResponse } from "next/server";
import { logAdminActionSafe, normalizeAdminReason } from "@/lib/admin/admin-audit";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import {
  adminForceRefundRequest,
  RefundRequestError,
  supportResolveRefundRequest,
} from "@/services/order-refund-request";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteCtx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const requestId = id?.trim();
  if (!requestId) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: { approve?: boolean; note?: string; forceRefund?: boolean; action?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Every admin refund decision needs a written reason (kept on the request and in the activity log).
  const reason = normalizeAdminReason(body.note);
  if (!reason) {
    return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });
  }

  const buyerId =
    (await prisma.orderRefundRequest.findUnique({ where: { id: requestId }, select: { buyerId: true } }))?.buyerId ?? null;

  try {
    if (body.action === "force_refund" || body.forceRefund === true) {
      const request = await adminForceRefundRequest({
        requestId,
        adminUserId: gate.userId,
        note: reason,
      });
      await logAdminActionSafe({
        adminUserId: gate.userId,
        action: "refund.force",
        targetType: "refund_request",
        targetId: requestId,
        targetUserId: buyerId,
        reason,
        detail: { orderId: request.orderId, status: request.status },
      });
      return NextResponse.json({ request });
    }

    if (typeof body.approve !== "boolean") {
      return NextResponse.json(
        { error: "approve required (or action: force_refund)" },
        { status: 400 },
      );
    }

    const request = await supportResolveRefundRequest({
      requestId,
      adminUserId: gate.userId,
      approve: body.approve,
      note: reason,
      forceRefund: Boolean(body.forceRefund),
    });
    await logAdminActionSafe({
      adminUserId: gate.userId,
      action: body.approve ? "refund.approve" : "refund.deny",
      targetType: "refund_request",
      targetId: requestId,
      targetUserId: buyerId,
      reason,
      detail: { orderId: request.orderId, status: request.status },
    });
    return NextResponse.json({ request });
  } catch (e) {
    if (e instanceof RefundRequestError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    console.error("[admin refund-requests PATCH]", e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
