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

type ChargeTarget = {
  orderId: string;
  labelCostCents: number;
  shippoTransactionId: string;
  shippoShipmentId: string | null;
  shipmentPackageId?: string | null;
  liveShippingSessionId: string | null;
  purpose?: "initial" | "replacement" | "additional_package" | null;
  replacesShippoTransactionId?: string | null;
};

/**
 * Explicit admin action: retry Stripe transfer reversal for chargeable labels missing clawback.
 * Handles bundled live shipping: label cost may live on a sibling order / session package while
 * this order still shows EXCEPTION in the ledger via packageLabelCostCents.
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
      stripePaymentIntentId: true,
      stripeTransferId: true,
      labelFinances: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const targets = await resolveLabelClawbackTargets(order);

  if (targets.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "NO_CHARGEABLE_LABEL",
        error:
          "No chargeable label missing a seller clawback on this order or its live shipping session. If the ledger still shows a shipping variance, refresh after deploy or open the session debit order (the one with Label cost > $0).",
        orderId: order.id,
        shippingLabelCostCents: order.shippingLabelCostCents,
        labelFinanceCount: order.labelFinances.length,
      },
      { status: 400 },
    );
  }

  console.info("[label_cost_retry_request]", {
    orderId: order.id,
    sellerId: order.sellerId,
    targets: targets.map((t) => ({
      orderId: t.orderId,
      shippoTransactionId: t.shippoTransactionId,
      labelCostCents: t.labelCostCents,
    })),
    priorReversedCents: order.shippingLabelCostReversedCents,
  });

  const results = [];
  for (const target of targets) {
    const result = await chargeSellerForLabelCost({
      orderId: target.orderId,
      labelCostCents: target.labelCostCents,
      shippoTransactionId: target.shippoTransactionId,
      shippoShipmentId: target.shippoShipmentId,
      shipmentPackageId: target.shipmentPackageId,
      liveShippingSessionId: target.liveShippingSessionId,
      purpose: target.purpose ?? "initial",
      replacesShippoTransactionId: target.replacesShippoTransactionId,
      skipReplacementWorkflow: true,
    });
    results.push({
      orderId: target.orderId,
      shippoTransactionId: target.shippoTransactionId,
      ...result,
    });
    if (!result.ok) {
      await markOrderLabelCostReversalFailed(target.orderId);
      console.info("[label_cost_retry_failed]", {
        orderId: target.orderId,
        shippoTransactionId: target.shippoTransactionId,
        code: result.code,
      });
      return NextResponse.json(
        {
          ok: false,
          code: result.code,
          error: result.error,
          orderId: order.id,
          chargedAgainstOrderId: target.orderId,
          results,
        },
        { status: 409 },
      );
    }
  }

  const chargedOrderIds = [...new Set(targets.map((t) => t.orderId))];
  const refreshed = await prisma.order.findMany({
    where: { id: { in: chargedOrderIds } },
    select: {
      id: true,
      shippingLabelCostReversedCents: true,
      shippingLabelCostReversalId: true,
    },
  });
  const primary =
    refreshed.find((r) => r.id === order.id) ??
    refreshed.find((r) => r.id === targets[0]?.orderId) ??
    null;

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    sellerId: order.sellerId,
    chargedAgainstOrderIds: chargedOrderIds,
    reversedCents: primary?.shippingLabelCostReversedCents ?? order.shippingLabelCostReversedCents,
    reversalId: primary?.shippingLabelCostReversalId ?? order.shippingLabelCostReversalId,
    results,
  });
}

async function resolveLabelClawbackTargets(order: {
  id: string;
  shippingLabelCostCents: number | null;
  shippoTransactionId: string | null;
  shippoShipmentId: string | null;
  shippingLabelCostReversedCents: number;
  shippingLabelCostReversalId: string | null;
  liveShippingSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeTransferId: string | null;
  labelFinances: Array<{
    shippoTransactionId: string;
    shippoShipmentId: string | null;
    shipmentPackageId: string | null;
    liveShippingSessionId: string | null;
    labelCostCents: number;
    purpose: "initial" | "replacement" | "additional_package";
    replacesShippoTransactionId: string | null;
    status: string;
    sellerClawbackCents: number;
    sellerClawbackReversalId: string | null;
  }>;
}): Promise<ChargeTarget[]> {
  const fromFinance = order.labelFinances
    .filter((row) => isLabelCostChargeable(row.status as never) && !labelHasSuccessfulClawback(row))
    .filter((row) => row.labelCostCents > 0 && row.shippoTransactionId.trim())
    .map((row) => ({
      orderId: order.id,
      labelCostCents: row.labelCostCents,
      shippoTransactionId: row.shippoTransactionId,
      shippoShipmentId: row.shippoShipmentId,
      shipmentPackageId: row.shipmentPackageId,
      liveShippingSessionId: row.liveShippingSessionId ?? order.liveShippingSessionId,
      purpose: row.purpose,
      replacesShippoTransactionId: row.replacesShippoTransactionId,
    }));
  if (fromFinance.length > 0) return fromFinance;

  // Legacy: order-level cost with no finance rows yet.
  if (
    order.labelFinances.length === 0 &&
    order.shippingLabelCostCents != null &&
    order.shippingLabelCostCents > 0 &&
    order.shippoTransactionId?.trim() &&
    !(
      order.shippingLabelCostReversedCents >= order.shippingLabelCostCents &&
      order.shippingLabelCostReversalId
    )
  ) {
    return [
      {
        orderId: order.id,
        labelCostCents: order.shippingLabelCostCents,
        shippoTransactionId: order.shippoTransactionId.trim(),
        shippoShipmentId: order.shippoShipmentId,
        liveShippingSessionId: order.liveShippingSessionId,
        purpose: "initial",
      },
    ];
  }

  const sessionId = order.liveShippingSessionId?.trim();
  if (!sessionId) return [];

  const session = await prisma.liveShippingSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      packages: {
        where: { labelCostCents: { gt: 0 }, shippoTransactionId: { not: null } },
        select: {
          id: true,
          labelCostCents: true,
          shippoTransactionId: true,
          shippoShipmentId: true,
          packageIndex: true,
        },
        orderBy: { packageIndex: "asc" },
      },
      orders: {
        select: {
          id: true,
          shippingLabelCostCents: true,
          shippoTransactionId: true,
          shippoShipmentId: true,
          stripePaymentIntentId: true,
          stripeTransferId: true,
          shippingLabelCostReversedCents: true,
          shippingLabelCostReversalId: true,
          labelFinances: {
            select: {
              shippoTransactionId: true,
              sellerClawbackCents: true,
              sellerClawbackReversalId: true,
              status: true,
              labelCostCents: true,
            },
          },
        },
      },
    },
  });
  if (!session || session.packages.length === 0) return [];

  // Prefer the session debit order (has shippingLabelCostCents), else any sibling with a PI, else this order.
  const debitSibling =
    session.orders.find((o) => (o.shippingLabelCostCents ?? 0) > 0) ??
    session.orders.find((o) => o.stripeTransferId?.trim() || o.stripePaymentIntentId?.trim()) ??
    session.orders.find((o) => o.id === order.id) ??
    session.orders[0];
  if (!debitSibling) return [];

  const targets: ChargeTarget[] = [];
  for (const pkg of session.packages) {
    const tx = pkg.shippoTransactionId?.trim();
    const cost = pkg.labelCostCents ?? 0;
    if (!tx || cost <= 0) continue;

    const alreadyClawed = session.orders.some((o) =>
      o.labelFinances.some(
        (f) =>
          f.shippoTransactionId === tx &&
          labelHasSuccessfulClawback(f) &&
          isLabelCostChargeable(f.status as never),
      ),
    );
    if (alreadyClawed) continue;

    // Prefer charging the order that already owns a finance row for this tx, else debit sibling.
    const owner =
      session.orders.find((o) =>
        o.labelFinances.some(
          (f) =>
            f.shippoTransactionId === tx &&
            isLabelCostChargeable(f.status as never) &&
            !labelHasSuccessfulClawback(f),
        ),
      ) ?? debitSibling;

    targets.push({
      orderId: owner.id,
      labelCostCents: cost,
      shippoTransactionId: tx,
      shippoShipmentId: pkg.shippoShipmentId ?? owner.shippoShipmentId,
      shipmentPackageId: pkg.id,
      liveShippingSessionId: sessionId,
      purpose: "initial",
    });
  }

  return targets;
}
