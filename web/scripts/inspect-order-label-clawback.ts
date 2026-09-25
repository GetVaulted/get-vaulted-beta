/** Quick read-only inspect for one order's label clawback evidence. */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const orderId = process.argv[2]?.trim();
if (!orderId) {
  console.error("Usage: npx tsx scripts/inspect-order-label-clawback.ts <orderId>");
  process.exit(1);
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { verifyShippoLabelRefundStatus } = await import(
    "../src/services/shipping/shippo-label-refund-status"
  );
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      sellerId: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      shippingLabelCostReversalId: true,
      shippoTransactionId: true,
      liveShippingSessionId: true,
      stripeTransferId: true,
      seller: { select: { stripeAccountId: true, username: true } },
    },
  });
  if (!o) {
    console.log(JSON.stringify({ error: "NOT_FOUND", orderId }));
    return;
  }
  const packages = await prisma.shipmentPackage.findMany({
    where: {
      OR: [
        { orderId: o.id },
        ...(o.liveShippingSessionId
          ? [{ liveShippingSessionId: o.liveShippingSessionId }]
          : []),
      ],
    },
    select: {
      shippoTransactionId: true,
      labelCostCents: true,
      labelUrl: true,
      status: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const txIds = [
    ...new Set(
      [o.shippoTransactionId, ...packages.map((p) => p.shippoTransactionId)]
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const verdicts = [];
  for (const txId of txIds) {
    const ev = await verifyShippoLabelRefundStatus(txId);
    const raw = (ev.rawTransaction ?? {}) as Record<string, unknown>;
    verdicts.push({
      shippoTransactionId: txId,
      verdict: ev.verdict,
      status: ev.transactionStatus,
      objectState: typeof raw.object_state === "string" ? raw.object_state : null,
      quoted:
        packages.find((p) => p.shippoTransactionId === txId)?.labelCostCents ?? null,
    });
  }
  console.log(
    JSON.stringify(
      {
        order: o,
        packages,
        verdicts,
        interpretation:
          "If clawback equals successful label only, failed attempts may not need credit.",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
