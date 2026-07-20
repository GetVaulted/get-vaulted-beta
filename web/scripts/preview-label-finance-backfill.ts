/**
 * Read-only historical compatibility preview for ShipmentLabelFinance backfill.
 * Does not mutate data.
 *
 * Usage (from web/):
 *   npx tsx scripts/preview-label-finance-backfill.ts
 *   npx tsx scripts/preview-label-finance-backfill.ts --limit=2000
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyOrderForLabelFinanceBackfill,
  type BackfillClass,
} from "../src/services/shipping/label-finance-backfill-preview";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = Math.min(Math.max(Number(limitArg?.split("=")[1] ?? 5000) || 5000, 1), 20000);

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { shippingLabelCostCents: { gt: 0 } },
        { shippingLabelCostReversedCents: { gt: 0 } },
        { shippoTransactionId: { not: null } },
      ],
    },
    select: {
      id: true,
      liveShippingSessionId: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      shippingLabelCostReversalId: true,
      shippoTransactionId: true,
    },
    orderBy: { updatedAt: "desc" },
    take: LIMIT,
  });

  const sessionIds = [
    ...new Set(orders.map((o) => o.liveShippingSessionId).filter((id): id is string => Boolean(id))),
  ];
  const packages = await prisma.shipmentPackage.findMany({
    where: {
      OR: [
        { orderId: { in: orders.map((o) => o.id) } },
        ...(sessionIds.length ? [{ liveShippingSessionId: { in: sessionIds } }] : []),
      ],
      shippoTransactionId: { not: null },
    },
    select: {
      orderId: true,
      liveShippingSessionId: true,
      packageIndex: true,
      shippoTransactionId: true,
      labelCostCents: true,
    },
  });

  const pkgsByOrder = new Map<string, typeof packages>();
  const pkgsBySession = new Map<string, typeof packages>();
  for (const p of packages) {
    if (p.orderId) {
      const list = pkgsByOrder.get(p.orderId) ?? [];
      list.push(p);
      pkgsByOrder.set(p.orderId, list);
    }
    if (p.liveShippingSessionId) {
      const list = pkgsBySession.get(p.liveShippingSessionId) ?? [];
      list.push(p);
      pkgsBySession.set(p.liveShippingSessionId, list);
    }
  }

  const classCounts: Record<BackfillClass, number> = {
    single_label_normal: 0,
    multiple_legitimate_packages: 0,
    replacement_regenerated_label: 0,
    missing_package_history: 0,
    cumulative_deduction_mismatch: 0,
    unresolved_shippo_status: 0,
    missing_stripe_reversal_history: 0,
  };

  let needsBackfill = 0;
  let deterministic = 0;
  let needsShippo = 0;
  let needsStripe = 0;
  let manualReview = 0;
  const examples: Record<string, string[]> = {};

  for (const o of orders) {
    const orderPkgs = pkgsByOrder.get(o.id) ?? [];
    const sessionPkgs = o.liveShippingSessionId ? pkgsBySession.get(o.liveShippingSessionId) ?? [] : [];
    const merged = orderPkgs.length > 0 ? orderPkgs : sessionPkgs;
    const txIds = [
      ...new Set(merged.map((p) => p.shippoTransactionId?.trim()).filter((id): id is string => Boolean(id))),
    ];
    if (txIds.length === 0 && o.shippoTransactionId?.trim()) {
      txIds.push(o.shippoTransactionId.trim());
    }

    const result = classifyOrderForLabelFinanceBackfill({
      shippingLabelCostCents: o.shippingLabelCostCents,
      shippingLabelCostReversedCents: o.shippingLabelCostReversedCents,
      shippingLabelCostReversalId: o.shippingLabelCostReversalId,
      shippoTransactionId: o.shippoTransactionId,
      packageCount: merged.length,
      distinctShippoTxCount: txIds.length,
      packageIndexes: merged.map((p) => p.packageIndex),
    });

    if (!result.needsBackfill) continue;
    needsBackfill += 1;
    if (result.deterministic) deterministic += 1;
    if (result.needsShippo) needsShippo += 1;
    if (result.needsStripe) needsStripe += 1;
    if (result.manualReview) manualReview += 1;
    for (const c of result.classes) {
      classCounts[c] += 1;
      const ex = examples[c] ?? [];
      if (ex.length < 5) {
        ex.push(o.id);
        examples[c] = ex;
      }
    }
  }

  let existingFinanceRows = 0;
  let financeTableReady = true;
  try {
    existingFinanceRows = await prisma.shipmentLabelFinance.count();
  } catch {
    financeTableReady = false;
  }

  console.log(
    JSON.stringify(
      {
        mode: "PREVIEW_READONLY",
        limit: LIMIT,
        totalOrdersScanned: orders.length,
        needsShipmentLabelFinanceBackfill: needsBackfill,
        canBackfillDeterministically: deterministic,
        requireShippoLookup: needsShippo,
        requireStripeLookup: needsStripe,
        requireManualReview: manualReview,
        classCounts,
        exampleOrderIdsByClass: examples,
        existingFinanceRows,
        financeTableReady,
        note: "Preview only — no rows written. unresolved_shippo_status means classification needs live Shippo before credit decisions.",
      },
      null,
      2,
    ),
  );
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("preview-label-finance-backfill.ts") ||
    process.argv[1].endsWith("preview-label-finance-backfill.js"));

if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
