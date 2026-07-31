/**
 * Read-only audit: have sellers been clawed for GV-paid shipping labels?
 *
 * Usage (from web/):
 *   npx tsx scripts/audit-seller-shipping-clawbacks.ts
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { loadAdminShippingReconciliationReport } = await import(
    "../src/lib/admin/shipping-reconciliation"
  );

  const unpaidFinance = await prisma.shipmentLabelFinance.findMany({
    where: {
      status: { notIn: ["refunded", "voided", "failed_purchase"] },
      labelCostCents: { gt: 0 },
      OR: [{ sellerClawbackReversalId: null }, { sellerClawbackCents: { lte: 0 } }],
    },
    select: {
      id: true,
      orderId: true,
      shippoTransactionId: true,
      labelCostCents: true,
      status: true,
      purpose: true,
      sellerClawbackCents: true,
      sellerClawbackReversalId: true,
      clawbackFailedAt: true,
      clawbackFailureDetail: true,
      createdAt: true,
      order: {
        select: {
          sellerId: true,
          shippingStatus: true,
          fulfillmentStatus: true,
          paymentStatus: true,
          seller: { select: { username: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const paidAgg = await prisma.shipmentLabelFinance.aggregate({
    where: {
      status: { notIn: ["refunded", "voided", "failed_purchase"] },
      labelCostCents: { gt: 0 },
      sellerClawbackReversalId: { not: null },
      sellerClawbackCents: { gt: 0 },
    },
    _sum: { sellerClawbackCents: true, labelCostCents: true },
    _count: true,
  });

  const chargeableAgg = await prisma.shipmentLabelFinance.aggregate({
    where: {
      status: { notIn: ["refunded", "voided", "failed_purchase"] },
      labelCostCents: { gt: 0 },
    },
    _sum: { labelCostCents: true, sellerClawbackCents: true },
    _count: true,
  });

  const orderUnpaid = await prisma.order.findMany({
    where: {
      shippingLabelCostCents: { gt: 0 },
      OR: [
        { shippingLabelCostReversedCents: { lte: 0 } },
        { shippingStatus: "label_cost_reversal_failed" },
      ],
    },
    select: {
      id: true,
      sellerId: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      shippingStatus: true,
      fulfillmentStatus: true,
      paymentStatus: true,
      seller: { select: { username: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  // Prefer finance-ledger unpaid; order-level is a secondary signal (may include in-flight).
  const unpaidFinanceCents = unpaidFinance.reduce((s, r) => s + r.labelCostCents, 0);
  const paidClawbackCents = paidAgg._sum.sellerClawbackCents ?? 0;
  const chargeableLabelCents = chargeableAgg._sum.labelCostCents ?? 0;
  const chargeableClawbackCents = chargeableAgg._sum.sellerClawbackCents ?? 0;

  const allTime = await loadAdminShippingReconciliationReport("all", {
    flaggedOnly: false,
    limit: 5000,
  });
  const flagged = await loadAdminShippingReconciliationReport("all", {
    flaggedOnly: true,
    limit: 500,
  });

  const summary = {
    chargeableLabelRows: chargeableAgg._count,
    chargeableLabelCostUsd: usd(chargeableLabelCents),
    clawedBackFromSellersUsd: usd(paidClawbackCents),
    clawbackOnChargeableRowsUsd: usd(chargeableClawbackCents),
    unrecoveredFromFinanceLedgerUsd: usd(unpaidFinanceCents),
    unpaidFinanceRowCount: unpaidFinance.length,
    orderLevelUnpaidOrFailedCount: orderUnpaid.length,
    reconciliationAllTime: {
      orderCount: allTime.orderCount,
      labeledOrderCount: allTime.labeledOrderCount,
      buyerShippingCollectedUsd: allTime.buyerShippingCollectedUsd,
      actualLabelCostUsd: allTime.actualLabelCostUsd,
      sellerDeductionUsd: allTime.sellerDeductionUsd,
      unrecoveredLabelCostUsd: allTime.unrecoveredLabelCostUsd,
      platformShippingNetUsd: allTime.platformShippingNetUsd,
      flaggedOrderCount: allTime.flaggedOrderCount,
    },
    flaggedSample: flagged.rows.slice(0, 25).map((r) => ({
      orderId: r.orderId,
      sellerId: r.sellerId,
      deductionStatus: r.deductionStatus,
      labelCostUsd: r.actualLabelCostCents != null ? usd(r.actualLabelCostCents) : null,
      sellerDeductionUsd: usd(r.sellerDeductionCents),
      reasons: r.flagReasons,
    })),
    unpaidFinanceSample: unpaidFinance.slice(0, 40).map((r) => ({
      orderId: r.orderId,
      seller: r.order.seller.username ?? r.order.seller.email,
      sellerId: r.order.sellerId,
      labelCostUsd: usd(r.labelCostCents),
      status: r.status,
      purpose: r.purpose,
      shippingStatus: r.order.shippingStatus,
      clawbackFailedAt: r.clawbackFailedAt,
      clawbackFailureDetail: r.clawbackFailureDetail,
      shippoTransactionId: r.shippoTransactionId,
    })),
    orderUnpaidSample: orderUnpaid.slice(0, 40).map((o) => ({
      orderId: o.id,
      seller: o.seller.username ?? o.seller.email,
      labelCostUsd: usd(o.shippingLabelCostCents ?? 0),
      reversedUsd: usd(o.shippingLabelCostReversedCents ?? 0),
      shippingStatus: o.shippingStatus,
      paymentStatus: o.paymentStatus,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  try {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
});
