import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import {
  chargeSellerForLabelCost,
  markOrderLabelCostReversalFailed,
} from "@/services/shipping/charge-seller-label-cost";
import {
  isLabelCostChargeable,
  labelHasSuccessfulClawback,
} from "@/services/shipping/label-finance";

/**
 * Explicit admin action: retry Stripe transfer reversal for chargeable labels missing clawback.
 * Does not run on page load. Idempotent per Shippo transaction via chargeSellerForLabelCost.
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
      shippoShipmentId: true,
      shippingLabelCostReversedCents: true,
      shippingLabelCostReversalId: true,
      liveShippingSessionId: true,
      labelFinances: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const missing = order.labelFinances.filter(
    (row) => isLabelCostChargeable(row.status) && !labelHasSuccessfulClawback(row),
  );

  // Legacy fallback when label finance rows were never backfilled.
  if (missing.length === 0 && order.labelFinances.length === 0) {
    const labelCostCents = order.shippingLabelCostCents;
    if (labelCostCents == null || labelCostCents <= 0) {
      return NextResponse.json(
        { error: "No chargeable label missing a seller clawback." },
        { status: 400 },
      );
    }
    if (
      order.shippingLabelCostReversedCents >= labelCostCents &&
      order.shippingLabelCostReversalId
    ) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "Order already has a seller deduction covering chargeable label cost.",
          orderId: order.id,
          reversedCents: order.shippingLabelCostReversedCents,
          reversalId: order.shippingLabelCostReversalId,
        },
      );
    }

    const result = await chargeSellerForLabelCost({
      orderId: order.id,
      labelCostCents,
      shippoTransactionId: order.shippoTransactionId,
      shippoShipmentId: order.shippoShipmentId,
      liveShippingSessionId: order.liveShippingSessionId,
      purpose: "initial",
    });
    if (!result.ok) {
      await markOrderLabelCostReversalFailed(order.id);
      return NextResponse.json(
        { ok: false, code: result.code, error: result.error, orderId: order.id },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      orderId: order.id,
      reversedCents: result.reversedCents,
      reversalId: result.reversalId,
      skipped: result.skipped,
    });
  }

  if (missing.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: "No chargeable label is missing a successful seller clawback.",
        orderId: order.id,
        reversedCents: order.shippingLabelCostReversedCents,
        reversalId: order.shippingLabelCostReversalId,
      },
    );
  }

  console.info("[label_cost_retry_request]", {
    orderId: order.id,
    sellerId: order.sellerId,
    missingShippoTransactionIds: missing.map((m) => m.shippoTransactionId),
    priorReversedCents: order.shippingLabelCostReversedCents,
  });

  const results = [];
  for (const row of missing) {
    const result = await chargeSellerForLabelCost({
      orderId: order.id,
      labelCostCents: row.labelCostCents,
      shippoTransactionId: row.shippoTransactionId,
      shippoShipmentId: row.shippoShipmentId,
      shipmentPackageId: row.shipmentPackageId,
      liveShippingSessionId: row.liveShippingSessionId ?? order.liveShippingSessionId,
      purpose: row.purpose,
      replacesShippoTransactionId: row.replacesShippoTransactionId,
      skipReplacementWorkflow: true,
    });
    results.push({
      shippoTransactionId: row.shippoTransactionId,
      ...result,
    });
    if (!result.ok) {
      await markOrderLabelCostReversalFailed(order.id);
      console.info("[label_cost_retry_failed]", {
        orderId: order.id,
        shippoTransactionId: row.shippoTransactionId,
        code: result.code,
      });
      return NextResponse.json(
        {
          ok: false,
          code: result.code,
          error: result.error,
          orderId: order.id,
          results,
        },
        { status: 409 },
      );
    }
  }

  const refreshed = await prisma.order.findUnique({
    where: { id: order.id },
    select: {
      shippingLabelCostReversedCents: true,
      shippingLabelCostReversalId: true,
    },
  });

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    sellerId: order.sellerId,
    reversedCents: refreshed?.shippingLabelCostReversedCents ?? order.shippingLabelCostReversedCents,
    reversalId: refreshed?.shippingLabelCostReversalId ?? order.shippingLabelCostReversalId,
    results,
  });
}
