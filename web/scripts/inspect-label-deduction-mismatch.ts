/**
 * Read-only investigation: orders where seller label deduction ≠ actual label cost.
 *
 * Usage (from web/):
 *   npx tsx scripts/inspect-label-deduction-mismatch.ts
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const mismatches = await prisma.order.findMany({
    where: {
      shippingLabelCostCents: { gt: 0 },
      shippingLabelCostReversedCents: { gt: 0 },
    },
    select: {
      id: true,
      sellerId: true,
      shippingChargedCents: true,
      shippingPriceUsd: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      shippingLabelCostReversalId: true,
      shippingLabelCostChargedShippoTransactionId: true,
      shippoTransactionId: true,
      fulfillmentStatus: true,
      shippingStatus: true,
      liveShippingSessionId: true,
      stripeTransferId: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const interesting = mismatches.filter((o) => {
    const label = o.shippingLabelCostCents ?? 0;
    const deducted = o.shippingLabelCostReversedCents ?? 0;
    return label > 0 && deducted > 0 && deducted !== label;
  });

  const exactDouble = interesting.filter((o) => {
    const label = o.shippingLabelCostCents ?? 0;
    return label > 0 && o.shippingLabelCostReversedCents === label * 2;
  });

  console.log(
    JSON.stringify(
      {
        scannedWithBothPositive: mismatches.length,
        mismatchCount: interesting.length,
        exactDoubleLabelChargeOrderIds: exactDouble.map((o) => o.id),
        rows: interesting.slice(0, 30).map((o) => {
          const label = o.shippingLabelCostCents ?? 0;
          const deducted = o.shippingLabelCostReversedCents ?? 0;
          return {
            orderId: o.id,
            buyerShippingCents: o.shippingChargedCents ?? Math.round(o.shippingPriceUsd * 100),
            actualLabelCostCents: label,
            sellerDeductionCents: deducted,
            deltaCents: deducted - label,
            looksLikeDoubleLabel: deducted === label * 2,
            priorPlusCurrentGuess: deducted - label,
            reversalId: o.shippingLabelCostReversalId,
            chargedShippoTx: o.shippingLabelCostChargedShippoTransactionId,
            currentShippoTx: o.shippoTransactionId,
            shippoTxMatch:
              Boolean(o.shippoTransactionId) &&
              o.shippoTransactionId === o.shippingLabelCostChargedShippoTransactionId,
            fulfillmentStatus: o.fulfillmentStatus,
            shippingStatus: o.shippingStatus,
            liveShippingSessionId: o.liveShippingSessionId,
          };
        }),
      },
      null,
      2,
    ),
  );

  // Deep dump of the known double-charge candidate(s).
  for (const o of exactDouble.slice(0, 5)) {
    const pkgs = await prisma.shipmentPackage.findMany({
      where: {
        OR: [
          { orderId: o.id },
          ...(o.liveShippingSessionId ? [{ liveShippingSessionId: o.liveShippingSessionId }] : []),
        ],
      },
      select: {
        id: true,
        orderId: true,
        liveShippingSessionId: true,
        labelCostCents: true,
        shippoTransactionId: true,
        createdAt: true,
      },
    });
    const sessionOrders = o.liveShippingSessionId
      ? await prisma.order.findMany({
          where: { liveShippingSessionId: o.liveShippingSessionId },
          select: {
            id: true,
            shippingLabelCostCents: true,
            shippingLabelCostReversedCents: true,
            shippingLabelCostReversalId: true,
            shippingLabelCostChargedShippoTransactionId: true,
            shippoTransactionId: true,
            fulfillmentStatus: true,
          },
        })
      : [];
    console.log(
      JSON.stringify(
        {
          deepDiveOrderId: o.id,
          packages: pkgs,
          sessionOrders,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
