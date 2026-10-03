/**
 * Read-only historical scan: seller clawbacks against failed/invalid Shippo purchases
 * or selected-rate quotes stored as actual label costs.
 *
 * Usage: npx tsx scripts/scan-failed-shippo-label-clawbacks.ts
 * Optional: --limit=200
 *
 * Does not mutate Stripe, Shippo, or the database.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 200) : 200;

type Flag =
  | "shippo_error_with_clawback"
  | "shippo_invalid_with_clawback"
  | "empty_billing_payments_with_clawback"
  | "missing_label_url_tracking_with_clawback"
  | "selected_rate_quote_as_label_cost";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { isShippoConfigured } = await import("../src/lib/shippo");
  const { verifyShippoLabelRefundStatus, extractProvenNoShippoCharge } = await import(
    "../src/services/shipping/shippo-label-refund-status"
  );

  if (!isShippoConfigured()) {
    console.error(JSON.stringify({ error: "SHIPPO_API_TOKEN is not set" }, null, 2));
    process.exit(1);
  }

  const candidates = await prisma.order.findMany({
    where: {
      OR: [
        { shippingLabelCostReversedCents: { gt: 0 } },
        { shippingLabelCostCents: { gt: 0 } },
      ],
    },
    select: {
      id: true,
      liveShippingSessionId: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      shippingLabelCostReversalId: true,
      shippoTransactionId: true,
      labelUrl: true,
      trackingNumber: true,
    },
    orderBy: { updatedAt: "desc" },
    take: LIMIT,
  });

  const affected: Array<{
    orderId: string;
    flags: Flag[];
    shippingLabelCostCents: number | null;
    shippingLabelCostReversedCents: number | null;
    shippoTransactionIds: string[];
    verdicts: string[];
  }> = [];

  const counts: Record<Flag, number> = {
    shippo_error_with_clawback: 0,
    shippo_invalid_with_clawback: 0,
    empty_billing_payments_with_clawback: 0,
    missing_label_url_tracking_with_clawback: 0,
    selected_rate_quote_as_label_cost: 0,
  };

  for (const order of candidates) {
    const clawbackCents = Math.max(0, order.shippingLabelCostReversedCents ?? 0);
    const hasClawback = clawbackCents > 0 || Boolean(order.shippingLabelCostReversalId?.trim());

    const packages = await prisma.shipmentPackage.findMany({
      where: {
        OR: [
          { orderId: order.id },
          ...(order.liveShippingSessionId
            ? [{ liveShippingSessionId: order.liveShippingSessionId }]
            : []),
        ],
      },
      select: {
        shippoTransactionId: true,
        labelCostCents: true,
        labelUrl: true,
        trackingNumber: true,
        status: true,
      },
    });

    const txIds = [
      ...new Set(
        [
          order.shippoTransactionId,
          ...packages.map((p) => p.shippoTransactionId),
        ]
          .map((id) => id?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const flags = new Set<Flag>();
    const verdicts: string[] = [];

    for (const txId of txIds) {
      const evidence = await verifyShippoLabelRefundStatus(txId);
      verdicts.push(`${txId}:${evidence.verdict}`);
      const raw = (evidence.rawTransaction ?? {}) as Record<string, unknown>;
      const objectState = String(raw.object_state ?? "").toUpperCase();
      const status = String(evidence.transactionStatus ?? "").toUpperCase();
      const labelUrl =
        typeof raw.label_url === "string" ? raw.label_url.trim() : "";
      const tracking =
        typeof raw.tracking_number === "string" ? raw.tracking_number.trim() : "";
      const paymentsEmpty =
        raw.billing != null &&
        typeof raw.billing === "object" &&
        Array.isArray((raw.billing as { payments?: unknown }).payments) &&
        (raw.billing as { payments: unknown[] }).payments.length === 0;
      const provenNoCharge = extractProvenNoShippoCharge(raw, evidence.messages);

      const failedOrInvalid =
        status === "ERROR" || status === "FAILED" || objectState === "INVALID";

      if (hasClawback && (status === "ERROR" || status === "FAILED")) {
        flags.add("shippo_error_with_clawback");
      }
      if (hasClawback && objectState === "INVALID") {
        flags.add("shippo_invalid_with_clawback");
      }
      // Empty payments only matters on failed/invalid txs (SUCCESS responses often omit billing).
      if (hasClawback && failedOrInvalid && paymentsEmpty) {
        flags.add("empty_billing_payments_with_clawback");
      }
      if (hasClawback && failedOrInvalid && (!labelUrl || !tracking)) {
        flags.add("missing_label_url_tracking_with_clawback");
      }
      if (
        hasClawback &&
        (evidence.verdict === "failed_purchase" || provenNoCharge) &&
        (order.shippingLabelCostCents ?? 0) > 0
      ) {
        flags.add("selected_rate_quote_as_label_cost");
      }
    }

    // Quote stored as cost without SUCCESS purchase evidence on packages.
    if (hasClawback) {
      const quoteAsCost = packages.some(
        (p) =>
          (p.labelCostCents ?? 0) > 0 &&
          (!p.labelUrl?.trim() || p.status === "estimated"),
      );
      if (quoteAsCost) flags.add("selected_rate_quote_as_label_cost");
    }

    if (flags.size === 0) continue;

    for (const f of flags) counts[f] += 1;
    affected.push({
      orderId: order.id,
      flags: [...flags],
      shippingLabelCostCents: order.shippingLabelCostCents,
      shippingLabelCostReversedCents: order.shippingLabelCostReversedCents,
      shippoTransactionIds: txIds,
      verdicts,
    });
  }

  const report = {
    mode: "READ_ONLY_SCAN",
    scannedOrderLimit: LIMIT,
    candidateOrders: candidates.length,
    affectedOrderCount: affected.length,
    affectedOrderIds: affected.map((a) => a.orderId),
    flagCounts: counts,
    affected,
    note: "No mutations performed. Use repair dry-run per order before any --apply.",
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
