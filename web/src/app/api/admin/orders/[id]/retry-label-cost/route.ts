import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import {
  chargeSellerForLabelCost,
  markOrderLabelCostReversalFailed,
} from "@/services/shipping/charge-seller-label-cost";

/**
 * Explicit admin action: retry Stripe transfer reversal for a GV Shippo label cost.
 * Does not run on page load. Idempotent via chargeSellerForLabelCost.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id: raw } = await ctx.params;
  const orderId = decodeURIComponent(raw);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      sellerId: true,
      shippingLabelCostCents: true,
      shippoTransactionId: true,
      shippingLabelCostReversedCents: true,
      shippingLabelCostReversalId: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const labelCostCents = order.shippingLabelCostCents;
  if (labelCostCents == null || labelCostCents <= 0) {
    return NextResponse.json(
      { error: "Order has no actual shippingLabelCostCents to reverse." },
      { status: 400 },
    );
  }

  const result = await chargeSellerForLabelCost({
    orderId: order.id,
    labelCostCents,
    shippoTransactionId: order.shippoTransactionId,
  });

  if (!result.ok) {
    await markOrderLabelCostReversalFailed(order.id);
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        error: result.error,
        orderId: order.id,
        labelCostCents,
        sellerId: order.sellerId,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    sellerId: order.sellerId,
    labelCostCents,
    reversedCents: result.reversedCents,
    reversalId: result.reversalId,
    skipped: result.skipped,
  });
}
