/**
 * SHIPPING AUDIT — FOLLOW-UP / VALIDATION PASS. Read-only. Zero mutations.
 *
 * Every call below is one of: Prisma findMany/findUnique, Shippo GET (`shippoFetch` with no
 * method or method:"GET"), or Stripe `.retrieve` / `.listReversals` (list, never create). There
 * is no `.update(`, `.create(`, `.upsert(`, `.delete(`, `createReversal(`, `refunds.create(`, or
 * any Shippo POST anywhere in this file.
 *
 * Answers, specifically:
 *   1. Why every transaction classified `refund_pending` despite SUCCESS + affirmatively-purchased.
 *      -> dumps the RAW /refunds/?transaction=<id> response for several different ids, plus one
 *         unfiltered call, so we can see whether Shippo actually honors the `transaction` filter.
 *   2. Why shippoRateAmountCents reads 0 and billing.payments reads [] for real paid labels.
 *      -> dumps the RAW transaction object (all top-level keys, typeof of `rate`, `billing` as-is)
 *         for a handful of real transactions spanning different purposes/statuses.
 *   3. Whether the 6 exactDoubleLabelCharge orders were REALLY deducted twice in Stripe.
 *      -> pulls every ShipmentLabelFinance row + the Order's stripeTransferId, then calls Stripe
 *         transfers.retrieve + transfers.listReversals (read-only) to get the real reversal history
 *         for that transfer, independent of our own DB bookkeeping.
 *   5. Classifies every "transactionsWithNoGvOrder" tx id using ShipmentPackage/session context.
 *
 * Usage (from web/, on your machine):
 *   npx tsx scripts/audit-shipping-followup-2026-08.ts > shipping-audit-followup.json
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const DOUBLE_CHARGE_ORDER_IDS = [
  "cmsjiij23001c09jrqho2taxu",
  "cmsjik35k000r09iepvqyrgwi",
  "cmsjillgt004t09jsmsha1p4y",
  "cmsjj68f1003o09l7jg8gewme",
  "cmsjjp7zo002t09ld9w45lb0z",
  "cmsjjrnw9006n09l71otbz9kx",
];

function usd(cents: number | null | undefined): number | null {
  if (cents == null) return null;
  return Math.round(cents) / 100;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { shippoFetch, shippoGetTransaction } = await import("../src/lib/shippo");
  const { isStripeConfigured, getStripe } = await import("../src/lib/stripe");

  const report: Record<string, unknown> = {
    mode: "FOLLOWUP_AUDIT_READONLY",
    generatedAt: new Date().toISOString(),
  };

  // ============================================================================================
  // PART 1 — is the Shippo `/refunds/?transaction=<id>` filter actually being honored?
  // ============================================================================================
  process.stderr.write("PART 1: probing Shippo /refunds/ filter behavior...\n");
  const sampleFinance = await prisma.shipmentLabelFinance.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { shippoTransactionId: true, status: true, orderId: true },
  });
  const sampleTxIds = [...new Set(sampleFinance.map((f) => f.shippoTransactionId))].slice(0, 5);

  const refundProbe: unknown[] = [];
  for (const txId of sampleTxIds) {
    try {
      const res = (await shippoFetch(`/refunds/?transaction=${encodeURIComponent(txId)}`)) as {
        results?: Array<Record<string, unknown>>;
        count?: number;
        next?: string | null;
      };
      refundProbe.push({
        queriedTransactionId: txId,
        resultCount: res.results?.length ?? 0,
        totalCount: res.count ?? null,
        results: (res.results ?? []).map((r) => ({
          object_id: r.object_id ?? null,
          status: r.status ?? null,
          transaction: r.transaction ?? null,
          transactionFieldMatchesQueried: r.transaction === txId,
          amount: r.amount ?? null,
          object_created: r.object_created ?? null,
        })),
      });
    } catch (e) {
      refundProbe.push({ queriedTransactionId: txId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  let unfilteredRefunds: unknown = null;
  try {
    const res = (await shippoFetch(`/refunds/`)) as {
      results?: Array<Record<string, unknown>>;
      count?: number;
    };
    unfilteredRefunds = {
      totalCount: res.count ?? null,
      resultCount: res.results?.length ?? 0,
      results: (res.results ?? []).slice(0, 20).map((r) => ({
        object_id: r.object_id ?? null,
        status: r.status ?? null,
        transaction: r.transaction ?? null,
        object_created: r.object_created ?? null,
      })),
    };
  } catch (e) {
    unfilteredRefunds = { error: e instanceof Error ? e.message : String(e) };
  }

  const filterAppearsIgnored = (() => {
    // If every filtered call returns the exact same set of refund object_ids regardless of the
    // queried transaction id, Shippo is not honoring `?transaction=`.
    const idSets = refundProbe
      .filter((r): r is { results: Array<{ object_id: string | null }> } =>
        Boolean(r && typeof r === "object" && "results" in (r as object)),
      )
      .map((r) => JSON.stringify((r.results ?? []).map((x) => x.object_id).sort()));
    const distinct = new Set(idSets);
    return idSets.length > 1 && distinct.size === 1;
  })();

  report.part1_refundFilterProbe = {
    note:
      "If `filterAppearsIgnored` is true, or any result's `transactionFieldMatchesQueried` is false, " +
      "the code in shippo-label-refund-status.ts is treating unrelated account-wide refunds as if " +
      "they belonged to the queried transaction — that is almost certainly why every transaction is " +
      "being classified refund_pending.",
    sampleTransactionIdsProbed: sampleTxIds,
    filteredResults: refundProbe,
    unfilteredAccountWideRefunds: unfilteredRefunds,
    filterAppearsIgnored,
  };

  // ============================================================================================
  // PART 2 — what does the RAW Shippo transaction object actually look like (rate/billing shape)?
  // ============================================================================================
  process.stderr.write("PART 2: dumping raw transaction shape for rate/billing fields...\n");
  const doubleChargeFinance = await prisma.shipmentLabelFinance.findMany({
    where: { orderId: { in: DOUBLE_CHARGE_ORDER_IDS } },
    select: { shippoTransactionId: true, orderId: true, status: true, labelCostCents: true },
  });
  const rawDumpTxIds = [
    ...new Set([...sampleTxIds, ...doubleChargeFinance.map((f) => f.shippoTransactionId)]),
  ].slice(0, 8);

  const rawShapeDump: unknown[] = [];
  for (const txId of rawDumpTxIds) {
    try {
      const raw = (await shippoGetTransaction(txId)) as Record<string, unknown>;
      const financeForTx = [...sampleFinance, ...doubleChargeFinance].find(
        (f) => f.shippoTransactionId === txId,
      );
      rawShapeDump.push({
        shippoTransactionId: txId,
        gvRecordedLabelCostCents:
          "labelCostCents" in (financeForTx ?? {}) ? (financeForTx as { labelCostCents: number }).labelCostCents : null,
        topLevelKeys: Object.keys(raw).sort(),
        status: raw.status ?? null,
        object_state: raw.object_state ?? null,
        rateFieldTypeofValue: typeof raw.rate,
        rateFieldRaw: raw.rate ?? null,
        hasBillingKey: "billing" in raw,
        billingFieldRaw: raw.billing ?? null,
        hasMetadataKey: "metadata" in raw,
        metadataFieldRaw: raw.metadata ?? null,
      });
    } catch (e) {
      rawShapeDump.push({ shippoTransactionId: txId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  report.part2_rawTransactionShape = {
    note:
      "Look at `rateFieldTypeofValue` — if it's 'string', the transaction's `rate` field is just the " +
      "rate object_id, not an expanded object with `.amount`, and the audit script's " +
      "shippoRateAmountCents=0 bug is exactly that: reading `.amount` off a string. Look at " +
      "`hasBillingKey` — if false for successful transactions, `billing` is only ever present on " +
      "error/failed transactions in this Shippo account tier, not a universal field.",
    rows: rawShapeDump,
  };

  // ============================================================================================
  // PART 3 — Stripe ground truth for the 6 exactDoubleLabelCharge orders.
  // ============================================================================================
  process.stderr.write("PART 3: pulling ShipmentLabelFinance + Stripe transfer/reversal history for double-charge orders...\n");
  const stripeConfigured = isStripeConfigured();
  const doubleChargeDetail: unknown[] = [];

  const doubleChargeOrders = await prisma.order.findMany({
    where: { id: { in: DOUBLE_CHARGE_ORDER_IDS } },
    select: {
      id: true,
      sellerId: true,
      stripeTransferId: true,
      stripePaymentIntentId: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      shippingLabelCostReversalId: true,
      shippingLabelCostChargedShippoTransactionId: true,
      shippingStatus: true,
      liveShippingSessionId: true,
      updatedAt: true,
      labelFinances: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          shippoTransactionId: true,
          shippoShipmentId: true,
          labelCostCents: true,
          purpose: true,
          replacesShippoTransactionId: true,
          status: true,
          sellerClawbackCents: true,
          sellerClawbackReversalId: true,
          sellerCreditCents: true,
          sellerCreditTransferId: true,
          clawbackFailedAt: true,
          clawbackFailureDetail: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  for (const o of doubleChargeOrders) {
    let stripeTransfer: Record<string, unknown> | null = null;
    let stripeReversals: Array<{ id: string; amount: number; created: number; metadata: Record<string, string> }> = [];
    let stripeError: string | null = null;

    if (stripeConfigured && o.stripeTransferId) {
      try {
        const stripe = getStripe();
        const transfer = await stripe.transfers.retrieve(o.stripeTransferId);
        stripeTransfer = {
          id: transfer.id,
          amount: transfer.amount,
          amount_reversed: transfer.amount_reversed,
          reversed: transfer.reversed,
          currency: transfer.currency,
          created: transfer.created,
          destination: typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id,
        };
        const reversals = await stripe.transfers.listReversals(o.stripeTransferId, { limit: 50 });
        stripeReversals = reversals.data.map((r) => ({
          id: r.id,
          amount: r.amount,
          created: r.created,
          metadata: Object.fromEntries(Object.entries(r.metadata ?? {}).map(([k, v]) => [k, String(v)])),
        }));
      } catch (e) {
        stripeError = e instanceof Error ? e.message : String(e);
      }
    }

    const dbClawbackReversalIds = o.labelFinances
      .map((f) => f.sellerClawbackReversalId)
      .filter((id): id is string => Boolean(id));
    const distinctStripeReversalIds = new Set(stripeReversals.map((r) => r.id));
    const dbReversalIdsMatchedInStripe = dbClawbackReversalIds.filter((id) => distinctStripeReversalIds.has(id));
    const stripeReversalIdsNotInDb = stripeReversals
      .map((r) => r.id)
      .filter((id) => !dbClawbackReversalIds.includes(id));

    doubleChargeDetail.push({
      orderId: o.id,
      liveShippingSessionId: o.liveShippingSessionId,
      order_shippingLabelCostCents: o.shippingLabelCostCents,
      order_shippingLabelCostReversedCents: o.shippingLabelCostReversedCents,
      order_shippingLabelCostReversalId: o.shippingLabelCostReversalId,
      order_shippingLabelCostChargedShippoTransactionId: o.shippingLabelCostChargedShippoTransactionId,
      order_shippingStatus: o.shippingStatus,
      shipmentLabelFinanceRows: o.labelFinances,
      shipmentLabelFinanceRowCount: o.labelFinances.length,
      sumOfFinanceRowClawbackCents: o.labelFinances.reduce((s, f) => s + f.sellerClawbackCents, 0),
      stripeConfigured,
      stripeTransferId: o.stripeTransferId,
      stripeTransfer,
      stripeReversalCount: stripeReversals.length,
      stripeReversalTotalCents: stripeReversals.reduce((s, r) => s + r.amount, 0),
      stripeReversals,
      dbClawbackReversalIds,
      dbReversalIdsConfirmedInStripe: dbReversalIdsMatchedInStripe,
      stripeReversalIdsNotRecordedInOurDb: stripeReversalIdsNotInDb,
      conclusion:
        stripeError != null
          ? `STRIPE_LOOKUP_FAILED: ${stripeError}`
          : stripeReversals.length >= 2
            ? "Stripe confirms 2+ real reversal objects on this transfer — the seller's Connect balance really was decremented more than once for this order."
            : stripeReversals.length === 1
              ? "Stripe shows exactly ONE reversal on this transfer — Order.shippingLabelCostReversedCents being 2x the current label cost is a DB/summary-field artifact, not a real double deduction."
              : "Stripe shows ZERO reversals on this transfer (or transfer/Stripe unavailable) — cannot confirm any real seller deduction from Stripe directly; rely on DB fields with caution.",
      stripeError,
    });
  }

  report.part3_doubleChargeStripeGroundTruth = {
    note: "Ground truth per order comes from stripeReversalCount / stripeReversals, not from Order.shippingLabelCostReversedCents.",
    orders: doubleChargeDetail,
  };

  // ============================================================================================
  // PART 5 — classify every Shippo transaction id that has no attached GV order.
  // ============================================================================================
  process.stderr.write("PART 5: classifying orphaned/no-order transaction ids...\n");
  const financeAll = await prisma.shipmentLabelFinance.findMany({ select: { shippoTransactionId: true, orderId: true } });
  const financeTxIds = new Set(financeAll.map((f) => f.shippoTransactionId));
  const ordersWithTx = await prisma.order.findMany({
    where: {
      OR: [{ shippoTransactionId: { not: null } }, { shippingLabelCostChargedShippoTransactionId: { not: null } }],
    },
    select: { id: true, shippoTransactionId: true, shippingLabelCostChargedShippoTransactionId: true },
  });
  const orderTxIds = new Set<string>();
  for (const o of ordersWithTx) {
    if (o.shippoTransactionId) orderTxIds.add(o.shippoTransactionId);
    if (o.shippingLabelCostChargedShippoTransactionId) orderTxIds.add(o.shippingLabelCostChargedShippoTransactionId);
  }

  const allPackages = await prisma.shipmentPackage.findMany({
    where: { shippoTransactionId: { not: null } },
    select: {
      shippoTransactionId: true,
      orderId: true,
      liveShippingSessionId: true,
      packageIndex: true,
      labelCostCents: true,
      status: true,
      createdAt: true,
    },
  });
  const packagesByTx = new Map<string, typeof allPackages>();
  for (const p of allPackages) {
    if (!p.shippoTransactionId) continue;
    const l = packagesByTx.get(p.shippoTransactionId) ?? [];
    l.push(p);
    packagesByTx.set(p.shippoTransactionId, l);
  }

  const noOrderTxIds = [...packagesByTx.keys()].filter((tx) => !financeTxIds.has(tx) && !orderTxIds.has(tx));

  // Pull the session + order context for every candidate package.
  const sessionIdsToCheck = [
    ...new Set(
      noOrderTxIds.flatMap((tx) => (packagesByTx.get(tx) ?? []).map((p) => p.liveShippingSessionId).filter(Boolean)),
    ),
  ] as string[];
  const relatedSessions =
    sessionIdsToCheck.length > 0
      ? await prisma.liveShippingSession.findMany({
          where: { id: { in: sessionIdsToCheck } },
          select: {
            id: true,
            orders: {
              select: { id: true, shippoTransactionId: true, shippingLabelCostCents: true, fulfillmentStatus: true, paymentStatus: true },
            },
          },
        })
      : [];
  const sessionsById = new Map(relatedSessions.map((s) => [s.id, s] as const));

  const noOrderClassified = noOrderTxIds.map((tx) => {
    const pkgs = packagesByTx.get(tx) ?? [];
    const orderIdsDirect = [...new Set(pkgs.map((p) => p.orderId).filter((x): x is string => Boolean(x)))];
    const sessionIdsForTx = [...new Set(pkgs.map((p) => p.liveShippingSessionId).filter((x): x is string => Boolean(x)))];
    const sessionContext = sessionIdsForTx.map((sid) => sessionsById.get(sid)).filter(Boolean);

    let classification:
      | "orphaned_no_order_no_session"
      | "session_exists_but_no_sibling_order_has_this_tx"
      | "direct_order_link_but_order_missing_or_excluded"
      | "unclassified" = "unclassified";

    if (orderIdsDirect.length === 0 && sessionIdsForTx.length === 0) {
      classification = "orphaned_no_order_no_session";
    } else if (orderIdsDirect.length > 0) {
      classification = "direct_order_link_but_order_missing_or_excluded";
    } else if (sessionIdsForTx.length > 0) {
      classification = "session_exists_but_no_sibling_order_has_this_tx";
    }

    return {
      shippoTransactionId: tx,
      packages: pkgs.map((p) => ({
        orderId: p.orderId,
        liveShippingSessionId: p.liveShippingSessionId,
        packageIndex: p.packageIndex,
        labelCostCents: p.labelCostCents,
        status: p.status,
        createdAt: p.createdAt,
      })),
      directOrderIds: orderIdsDirect,
      sessionIds: sessionIdsForTx,
      sessionContext,
      classification,
    };
  });

  const classCounts: Record<string, number> = {};
  for (const r of noOrderClassified) classCounts[r.classification] = (classCounts[r.classification] ?? 0) + 1;

  report.part5_noOrderTransactionClassification = {
    note:
      "orphaned_no_order_no_session = a real Shippo purchase attempt (ShipmentPackage row with a tx id) " +
      "that never got attributed to ANY order or live session — this is the strongest candidate for a " +
      "genuinely unrecovered GV cost with zero seller clawback ever attempted. " +
      "direct_order_link_but_order_missing_or_excluded = the package points at an orderId that either " +
      "doesn't exist or fell outside our Order query filters. " +
      "session_exists_but_no_sibling_order_has_this_tx = a live-session bundle where the purchased " +
      "package's tx id was never stamped onto any of that session's orders (a bundling attribution bug, " +
      "or the session's orders legitimately show 0 by design and the tx sits only on the sibling debit " +
      "order not captured here).",
    totalNoOrderTxIds: noOrderTxIds.length,
    classificationCounts: classCounts,
    rows: noOrderClassified,
  };

  console.log(JSON.stringify(report, null, 2));
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
