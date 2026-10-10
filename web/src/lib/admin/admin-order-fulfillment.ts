import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin/admin-audit";

export class OrderFixError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
    this.name = "OrderFixError";
  }
}

export type FulfillmentAction = "set_tracking" | "mark_shipped" | "mark_delivered";

const trim = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Correct a stuck order's shipping state (wrong or missing tracking, seller never pressed Shipped,
 * carrier scan never arrived). Card/standard orders only: escrow orders have their own state machine.
 * Marking shipped/delivered re-runs the normal payout evaluation, which still applies every payout
 * hold and block, so this never releases money by itself.
 */
export async function adminFixOrderFulfillment(args: {
  adminUserId: string;
  orderId: string;
  action: FulfillmentAction;
  carrier?: string;
  trackingNumber?: string;
  reason: string;
}) {
  const order = await prisma.order.findUnique({
    where: { id: args.orderId },
    select: {
      id: true,
      sellerId: true,
      paymentStatus: true,
      paymentMethod: true,
      status: true,
      fulfillmentStatus: true,
      shippedAt: true,
      deliveryConfirmedAt: true,
      carrier: true,
      trackingNumber: true,
    },
  });
  if (!order) throw new OrderFixError("NOT_FOUND", 404);
  if (order.paymentStatus !== "paid") throw new OrderFixError("ORDER_NOT_PAID", 400);
  if (order.paymentMethod === "escrow") throw new OrderFixError("ESCROW_USE_ESCROW_FLOW", 400);

  const carrier = trim(args.carrier, 60);
  const tracking = trim(args.trackingNumber, 120);
  const before = {
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
  };
  const now = new Date();

  if (args.action === "set_tracking") {
    if (!tracking) throw new OrderFixError("TRACKING_REQUIRED", 400);
    await prisma.order.update({
      where: { id: order.id },
      data: { trackingNumber: tracking, ...(carrier ? { carrier } : {}) },
    });
  } else if (args.action === "mark_shipped") {
    if (order.fulfillmentStatus === "shipped" || order.fulfillmentStatus === "delivered") {
      throw new OrderFixError("ALREADY_SHIPPED", 409);
    }
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "shipped",
        fulfillmentStatus: "shipped",
        shippedAt: order.shippedAt ?? now,
        ...(tracking ? { trackingNumber: tracking } : {}),
        ...(carrier ? { carrier } : {}),
      },
    });
  } else if (args.action === "mark_delivered") {
    if (order.fulfillmentStatus === "delivered") throw new OrderFixError("ALREADY_DELIVERED", 409);
    await prisma.order.update({
      where: { id: order.id },
      data: {
        fulfillmentStatus: "delivered",
        shippedAt: order.shippedAt ?? now,
        deliveryConfirmedAt: order.deliveryConfirmedAt ?? now,
      },
    });
  } else {
    throw new OrderFixError("INVALID_ACTION", 400);
  }

  await logAdminAction({
    adminUserId: args.adminUserId,
    action: `order.${args.action}`,
    targetType: "order",
    targetId: order.id,
    targetUserId: order.sellerId,
    reason: args.reason,
    detail: { before, carrier: carrier || undefined, trackingNumber: tracking || undefined },
  });

  // Run the normal payout rules; holds/blocks (disputes, risk review) still apply.
  try {
    const events = await import("@/services/payout/process-payout-tier-events");
    if (args.action === "mark_shipped") await events.processSellerMarkedShippedPayoutEvaluation(order.id);
    if (args.action === "mark_delivered") await events.processStandardDeliveryPayoutEvaluation(order.id);
  } catch (e) {
    console.error("[admin order fulfillment] payout evaluation failed", order.id, e);
  }

  return { ok: true as const };
}
