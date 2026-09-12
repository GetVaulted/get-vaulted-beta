/**
 * SHIPPING FINANCIAL AUDIT — read-only, makes ZERO writes to the database or to Shippo.
 * Every call in this file is a Prisma `findMany`/`aggregate`/`count` or a Shippo GET. There is
 * no `.update(`, `.create(`, `.upsert(`, `.delete(` anywhere below.
 *
 * What it proves, per the request:
 *   1. Shippo source of truth — classifies every known Shippo transaction id (successful /
 *      failed / voided / refunded / refund_pending / replacement / duplicate / orphaned) using
 *      a LIVE call to the Shippo API (never trusts a DB status alone).
 *   2. Order-level shipping ledger — buyer shipping collected vs. successful label cost vs.
 *      seller clawback vs. seller credit vs. net GV cost, per order.
 *   3. Double-charge / mislabel audit — every anomaly pattern called out in the request.
 *   4/5. Shippo-vs-GV and buyer-vs-label-vs-clawback totals.
 *   6. Shippo billing-exposure check (rate-vs-charged mismatches; notes what Shippo's own
 *      per-transaction API can never prove, so you know what to pull from the Shippo dashboard).
 *
 * Usage (from the `web/` directory, on your own machine — NOT in any sandbox):
 *   npx tsx scripts/audit-shipping-financial-2026-08.ts                       > shipping-audit.json
 *   npx tsx scripts/audit-shipping-financial-2026-08.ts --no-live-shippo      > shipping-audit-db-only.json
 *   npx tsx scripts/audit-shipping-financial-2026-08.ts --limit=300           (quick smoke test)
 *
 * Progress is written to stderr so redirecting stdout to a file still shows you it's alive.
 * Send me the resulting JSON file (or paste it) and I'll produce the final written report.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const argv = process.argv.slice(2);
const NO_LIVE_SHIPPO = argv.includes("--no-live-shippo");
const limitArg = argv.find((a) => a.startsWith("--limit="));
const ORDER_LIMIT = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 100000) : 100000;
const CONCURRENCY = 4;

function centsFromUsdString(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function usd(cents: number): number {
  return Math.round(cents) / 100;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/Shippo 429/.test(msg) || /timed out/i.test(msg) || /Shippo 5\d\d/.test(msg)) {
        await sleep(400 * (i + 1) * (i + 1));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  const total = items.length;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i]!, i);
      } catch (e) {
        results[i] = { __error: e instanceof Error ? e.message : String(e) } as unknown as R;
      }
      done++;
      if (done % 25 === 0 || done === total) {
        process.stderr.write(`  live-Shippo verify: ${done}/${total}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => worker()));
  return results;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const {
    summarizeLabelFinanceRows,
    isLabelCostChargeable,
    labelHasSuccessfulClawback,
    labelHasSuccessfulCredit,
  } = await import("../src/services/shipping/label-finance");
  const { verifyShippoLabelRefundStatus } = await import(
    "../src/services/shipping/shippo-label-refund-status"
  );
  const { isShippoConfigured } = await import("../src/lib/shippo");

  const liveShippoAvailable = !NO_LIVE_SHIPPO && isShippoConfigured();
  process.stderr.write(
    `Live Shippo verification: ${liveShippoAvailable ? "ON" : "OFF (" + (NO_LIVE_SHIPPO ? "--no-live-shippo" : "SHIPPO_API_TOKEN missing") + ")"}\n`,
  );

  const orderSelect = {
    id: true,
    sellerId: true,
    buyerId: true,
    paymentStatus: true,
    payoutStatus: true,
    fulfillmentStatus: true,
    shippingStatus: true,
    liveShippingSessionId: true,
    shippingChargedCents: true,
    shippingPriceUsd: true,
    shippingLabelCostCents: true,
    shippingLabelCostReversedCents: true,
    shippingLabelCostReversalId: true,
    shippingLabelCostChargedShippoTransactionId: true,
    shippoTransactionId: true,
    shippoShipmentId: true,
    labelUrl: true,
    labelCreatedAt: true,
    carrier: true,
    service: true,
    trackingNumber: true,
    createdAt: true,
    updatedAt: true,
    seller: { select: { username: true, email: true } },
  } as const;

  process.stderr.write("Loading ShipmentLabelFinance ledger (full history, no filter)...\n");
  const financeRows = await prisma.shipmentLabelFinance.findMany({ orderBy: { createdAt: "asc" } });

  process.stderr.write("Loading orders that touch shipping...\n");
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { shippingLabelCostCents: { gt: 0 } },
        { shippingLabelCostReversedCents: { gt: 0 } },
        { shippoTransactionId: { not: null } },
        { labelFinances: { some: {} } },
        { shipmentPackages: { some: { shippoTransactionId: { not: null } } } },
      ],
    },
    select: orderSelect,
    orderBy: { createdAt: "asc" },
    take: ORDER_LIMIT,
  });

  // Make sure every order that owns a ShipmentLabelFinance row is present even if it fell outside
  // the OR filter for some reason (defensive — should be redundant with `labelFinances: some {}`).
  const orderIds = new Set(orders.map((o) => o.id));
  const financeOrderIdsMissing = [...new Set(financeRows.map((f) => f.orderId))].filter(
    (id) => !orderIds.has(id),
  );
  const extraOrders =
    financeOrderIdsMissing.length > 0
      ? await prisma.order.findMany({ where: { id: { in: financeOrderIdsMissing } }, select: orderSelect })
      : [];
  const allOrders = [...orders, ...extraOrders];
  const allOrderIds = allOrders.map((o) => o.id);
  const sessionIds = [
    ...new Set(allOrders.map((o) => o.liveShippingSessionId).filter((x): x is string => Boolean(x))),
  ];

  process.stderr.write(`Loading ShipmentPackage rows for ${allOrderIds.length} orders / ${sessionIds.length} sessions...\n`);
  const packages = await prisma.shipmentPackage.findMany({
    where: {
      OR: [
        { orderId: { in: allOrderIds } },
        ...(sessionIds.length > 0 ? [{ liveShippingSessionId: { in: sessionIds } }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  // --- Group everything by order / session --------------------------------------------------
  const financeByOrder = new Map<string, typeof financeRows>();
  for (const f of financeRows) {
    const list = financeByOrder.get(f.orderId) ?? [];
    list.push(f);
    financeByOrder.set(f.orderId, list);
  }
  const packagesByOrder = new Map<string, typeof packages>();
  const packagesBySession = new Map<string, typeof packages>();
  for (const p of packages) {
    if (p.orderId) {
      const l = packagesByOrder.get(p.orderId) ?? [];
      l.push(p);
      packagesByOrder.set(p.orderId, l);
    }
    if (p.liveShippingSessionId) {
      const l = packagesBySession.get(p.liveShippingSessionId) ?? [];
      l.push(p);
      packagesBySession.set(p.liveShippingSessionId, l);
    }
  }

  // --- Collect every distinct Shippo transaction id we know about ---------------------------
  const allTxIds = new Set<string>();
  for (const f of financeRows) if (f.shippoTransactionId?.trim()) allTxIds.add(f.shippoTransactionId.trim());
  for (const p of packages) if (p.shippoTransactionId?.trim()) allTxIds.add(p.shippoTransactionId.trim());
  for (const o of allOrders) {
    if (o.shippoTransactionId?.trim()) allTxIds.add(o.shippoTransactionId.trim());
    if (o.shippingLabelCostChargedShippoTransactionId?.trim()) {
      allTxIds.add(o.shippingLabelCostChargedShippoTransactionId.trim());
    }
  }
  const txIdList = [...allTxIds];
  process.stderr.write(`Distinct Shippo transaction ids found in DB: ${txIdList.length}\n`);

  // --- Live-verify every transaction against Shippo (never trust DB status alone) -----------
  type Evidence = Awaited<ReturnType<typeof verifyShippoLabelRefundStatus>>;
  const evidenceByTx = new Map<string, Evidence | { __error: string }>();
  if (liveShippoAvailable && txIdList.length > 0) {
    process.stderr.write("Verifying every transaction live against Shippo...\n");
    const results = await mapWithConcurrency(txIdList, CONCURRENCY, (txId) =>
      withRetry(() => verifyShippoLabelRefundStatus(txId)),
    );
    txIdList.forEach((txId, i) => evidenceByTx.set(txId, results[i]!));
  }

  function liveEvidenceFor(txId: string | null | undefined): Evidence | null {
    if (!txId) return null;
    const e = evidenceByTx.get(txId.trim());
    if (!e || "__error" in e) return null;
    return e as Evidence;
  }

  // --- SECTION 1: Shippo source of truth ------------------------------------------------------
  const txClassification: Record<string, unknown>[] = [];
  const seenOrderIdsForTx = new Map<string, Set<string>>();
  for (const f of financeRows) {
    const set = seenOrderIdsForTx.get(f.shippoTransactionId) ?? new Set<string>();
    set.add(f.orderId);
    seenOrderIdsForTx.set(f.shippoTransactionId, set);
  }

  const section1Buckets = {
    successfulPurchasedLabels: [] as string[],
    failedOrErrorTransactions: [] as string[],
    voidedLabels: [] as string[],
    refundedLabels: [] as string[],
    refundPending: [] as string[],
    replacementOrRegenerated: [] as string[],
    duplicateTransactionsAcrossOrders: [] as string[],
    transactionsWithNoGvOrder: [] as string[],
    unknownOrUnverifiable: [] as string[],
  };

  for (const txId of txIdList) {
    const evidenceRaw = evidenceByTx.get(txId);
    const evidence = evidenceRaw && !("__error" in evidenceRaw) ? evidenceRaw : null;
    const financeForTx = financeRows.filter((f) => f.shippoTransactionId === txId);
    const orderIdsForTx = [...(seenOrderIdsForTx.get(txId) ?? new Set<string>())];

    const dbStatuses = [...new Set(financeForTx.map((f) => f.status))];
    const dbPurposes = [...new Set(financeForTx.map((f) => f.purpose))];
    const proof: Evidence["purchaseProof"] | null = evidence?.purchaseProof ?? null;

    const record = {
      shippoTransactionId: txId,
      liveVerified: Boolean(evidence),
      liveLookupError: evidenceRaw && "__error" in evidenceRaw ? evidenceRaw.__error : null,
      liveVerdict: evidence?.verdict ?? null,
      liveTransactionStatus: evidence?.transactionStatus ?? null,
      liveRefundStatuses: evidence?.refundStatuses ?? [],
      liveAffirmativelyPurchased: proof?.affirmativelyPurchased ?? null,
      dbStatuses,
      dbPurposes,
      orderIdsAttached: orderIdsForTx,
      appearsOnMultipleOrders: orderIdsForTx.length > 1,
      financeRowCount: financeForTx.length,
      financeRowIds: financeForTx.map((f) => f.id),
      totalLabelCostCentsRecorded: financeForTx.reduce((s, f) => s + f.labelCostCents, 0),
      totalSellerClawbackCentsRecorded: financeForTx.reduce((s, f) => s + f.sellerClawbackCents, 0),
      totalSellerCreditCentsRecorded: financeForTx.reduce((s, f) => s + f.sellerCreditCents, 0),
      shippoActuallyCharged: liveShippoAvailable
        ? (proof?.affirmativelyPurchased ?? false) && evidence?.verdict !== "refunded"
        : null,
    };
    txClassification.push(record);

    if (orderIdsForTx.length === 0 && financeForTx.length === 0) {
      section1Buckets.transactionsWithNoGvOrder.push(txId);
    }
    if (orderIdsForTx.length > 1) section1Buckets.duplicateTransactionsAcrossOrders.push(txId);
    if (dbPurposes.includes("replacement")) section1Buckets.replacementOrRegenerated.push(txId);

    if (!evidence) {
      section1Buckets.unknownOrUnverifiable.push(txId);
      continue;
    }
    switch (evidence.verdict) {
      case "chargeable":
        section1Buckets.successfulPurchasedLabels.push(txId);
        break;
      case "refunded":
        section1Buckets.refundedLabels.push(txId);
        break;
      case "refund_pending":
        section1Buckets.refundPending.push(txId);
        break;
      case "failed_purchase":
        section1Buckets.failedOrErrorTransactions.push(txId);
        break;
      default:
        section1Buckets.unknownOrUnverifiable.push(txId);
    }
    if (dbStatuses.includes("voided")) section1Buckets.voidedLabels.push(txId);
  }

  // --- SECTION 2 + helper for section 3/4/5: build the per-order ledger ---------------------
  type OrderRow = (typeof allOrders)[number];
  type OrderLedgerRow = {
    orderId: string;
    sellerId: string;
    sellerHandle: string | null;
    paymentStatus: string;
    liveShippingSessionId: string | null;
    source: "label_finance" | "legacy_order_fields_only";
    buyerShippingCollectedCents: number;
    successfulLabelCostCents: number;
    liveConfirmedShippoRefundCents: number;
    expectedSellerClawbackCents: number;
    actualSellerClawbackCents: number;
    actualSellerCreditCents: number;
    actualNetSellerDeductionCents: number;
    netGetVaultedShippingCostCents: number;
    varianceCents: number;
    flagged: boolean;
    flagReasons: string[];
    shippoTransactionIds: string[];
  };

  const ledgerRows: OrderLedgerRow[] = [];

  function buyerShippingCentsFor(o: OrderRow): number {
    if (o.shippingChargedCents != null) return Math.max(0, o.shippingChargedCents);
    return Math.max(0, Math.round((o.shippingPriceUsd ?? 0) * 100));
  }

  for (const o of allOrders) {
    const finance = financeByOrder.get(o.id) ?? [];
    const flagReasons: string[] = [];
    const buyerShippingCollectedCents = buyerShippingCentsFor(o);

    if (finance.length > 0) {
      const summary = summarizeLabelFinanceRows(finance);
      let successfulLabelCostCents = 0;
      let liveConfirmedShippoRefundCents = 0;
      const txIds: string[] = [];

      for (const row of finance) {
        txIds.push(row.shippoTransactionId);
        const evidence = liveEvidenceFor(row.shippoTransactionId);
        // "Ever successfully purchased" = not failed_purchase AND either DB recorded a positive
        // labelCostCents OR (when live-verified) Shippo confirms affirmative purchase.
        const dbEverPurchased = row.status !== "failed_purchase" && row.labelCostCents > 0;
        const liveEverPurchased = evidence?.purchaseProof.affirmativelyPurchased ?? null;

        if (liveShippoAvailable && evidence && liveEverPurchased !== dbEverPurchased) {
          flagReasons.push(
            `shippoTx=${row.shippoTransactionId}: DB says everPurchased=${dbEverPurchased} but live Shippo says ${liveEverPurchased} (verdict=${evidence.verdict})`,
          );
        }
        const everPurchased = liveShippoAvailable && evidence ? liveEverPurchased : dbEverPurchased;
        if (everPurchased) {
          successfulLabelCostCents += row.labelCostCents;
        } else if (row.labelCostCents > 0) {
          // DB recorded a cost but live Shippo disputes the purchase — do not count it as a cost.
          flagReasons.push(
            `shippoTx=${row.shippoTransactionId}: labelCostCents=${row.labelCostCents} recorded but Shippo does not confirm an affirmative purchase`,
          );
        }

        if (evidence) {
          const successfulRefunds = evidence.refunds.filter((r) => r.status === "SUCCESS");
          for (const r of successfulRefunds) {
            liveConfirmedShippoRefundCents += centsFromUsdString(r.amount);
          }
        }
      }

      const expectedSellerClawbackCents = Math.max(0, successfulLabelCostCents - liveConfirmedShippoRefundCents);
      const actualSellerClawbackCents = summary.grossSellerClawbackCents;
      const actualSellerCreditCents = summary.sellerCreditCents;
      const actualNetSellerDeductionCents = summary.netSellerDeductionCents;
      const varianceCents = actualNetSellerDeductionCents - expectedSellerClawbackCents;

      if (varianceCents !== 0) {
        flagReasons.push(
          `Net seller deduction ($${usd(actualNetSellerDeductionCents)}) != expected clawback ($${usd(expectedSellerClawbackCents)})`,
        );
      }
      if (summary.labelsMissingClawback.length > 0) {
        flagReasons.push(
          `${summary.labelsMissingClawback.length} chargeable label(s) never successfully clawed back from seller`,
        );
      }
      if (summary.labelsNeedingCredit.length > 0) {
        flagReasons.push(
          `${summary.labelsNeedingCredit.length} refunded/voided/failed label(s) were clawed back but seller was never credited`,
        );
      }
      if (summary.hasRefundPending) {
        flagReasons.push("Shippo refund still pending for at least one label on this order");
      }

      ledgerRows.push({
        orderId: o.id,
        sellerId: o.sellerId,
        sellerHandle: o.seller.username ?? o.seller.email ?? null,
        paymentStatus: o.paymentStatus,
        liveShippingSessionId: o.liveShippingSessionId,
        source: "label_finance",
        buyerShippingCollectedCents,
        successfulLabelCostCents,
        liveConfirmedShippoRefundCents,
        expectedSellerClawbackCents,
        actualSellerClawbackCents,
        actualSellerCreditCents,
        actualNetSellerDeductionCents,
        netGetVaultedShippingCostCents: successfulLabelCostCents - liveConfirmedShippoRefundCents - actualNetSellerDeductionCents,
        varianceCents,
        flagged: flagReasons.length > 0,
        flagReasons,
        shippoTransactionIds: [...new Set(txIds)],
      });
      continue;
    }

    // Legacy path: no ShipmentLabelFinance rows exist for this order — ledger not backfilled.
    // Use Order summary fields directly, cross-verified against live Shippo when possible.
    const labelCostCents = Math.max(0, o.shippingLabelCostCents ?? 0);
    const reversedCents = Math.max(0, o.shippingLabelCostReversedCents ?? 0);
    const txId = o.shippoTransactionId?.trim() || null;
    const evidence = liveEvidenceFor(txId);

    let successfulLabelCostCents = 0;
    let liveConfirmedShippoRefundCents = 0;
    if (labelCostCents > 0) {
      const everPurchased = liveShippoAvailable && evidence ? evidence.purchaseProof.affirmativelyPurchased : true;
      if (!everPurchased) {
        flagReasons.push(
          `[legacy, no ledger] shippoTx=${txId}: Order.shippingLabelCostCents=${labelCostCents} but live Shippo does not confirm an affirmative purchase (verdict=${evidence?.verdict})`,
        );
      } else {
        successfulLabelCostCents = labelCostCents;
      }
      if (evidence) {
        const successfulRefunds = evidence.refunds.filter((r) => r.status === "SUCCESS");
        for (const r of successfulRefunds) liveConfirmedShippoRefundCents += centsFromUsdString(r.amount);
      }
    }
    const expectedSellerClawbackCents = Math.max(0, successfulLabelCostCents - liveConfirmedShippoRefundCents);
    const varianceCents = reversedCents - expectedSellerClawbackCents;
    if (varianceCents !== 0) {
      flagReasons.push(
        `[legacy, no ledger] Order.shippingLabelCostReversedCents ($${usd(reversedCents)}) != expected clawback ($${usd(expectedSellerClawbackCents)})`,
      );
    }
    if (!liveShippoAvailable) {
      flagReasons.push("[legacy, no ledger] Not independently verified against live Shippo this run.");
    }

    ledgerRows.push({
      orderId: o.id,
      sellerId: o.sellerId,
      sellerHandle: o.seller.username ?? o.seller.email ?? null,
      paymentStatus: o.paymentStatus,
      liveShippingSessionId: o.liveShippingSessionId,
      source: "legacy_order_fields_only",
      buyerShippingCollectedCents,
      successfulLabelCostCents,
      liveConfirmedShippoRefundCents,
      expectedSellerClawbackCents,
      actualSellerClawbackCents: reversedCents,
      actualSellerCreditCents: 0,
      actualNetSellerDeductionCents: reversedCents,
      netGetVaultedShippingCostCents: successfulLabelCostCents - liveConfirmedShippoRefundCents - reversedCents,
      varianceCents,
      flagged: flagReasons.length > 0,
      flagReasons,
      shippoTransactionIds: txId ? [txId] : [],
    });
  }

  // --- SECTION 3: double-charge / anomaly audit ----------------------------------------------
  const anomalies = {
    sameShippoTxChargedOnMultipleOrders: [] as unknown[],
    exactDoubleLabelCharge: [] as unknown[],
    failedTreatedAsCost: [] as unknown[],
    replacementBothLabelsCharged: [] as unknown[],
    refundedNoSellerCredit: [] as unknown[],
    creditedWithoutClawback: [] as unknown[],
    labelChargedNoClawback: [] as unknown[],
    clawbackWithNoSuccessfulLabel: [] as unknown[],
    multipleLabelsPerOrder: [] as unknown[],
    bundledSessionDoubleAttribution: [] as unknown[],
  };

  // same Shippo tx clawed back with a reversal id on more than one order
  const clawbackByTx = new Map<string, { orderId: string; reversalId: string; cents: number }[]>();
  for (const f of financeRows) {
    if (!labelHasSuccessfulClawback(f)) continue;
    const list = clawbackByTx.get(f.shippoTransactionId) ?? [];
    list.push({ orderId: f.orderId, reversalId: f.sellerClawbackReversalId!, cents: f.sellerClawbackCents });
    clawbackByTx.set(f.shippoTransactionId, list);
  }
  for (const [txId, list] of clawbackByTx) {
    const distinctReversalIds = new Set(list.map((l) => l.reversalId));
    if (distinctReversalIds.size > 1) {
      anomalies.sameShippoTxChargedOnMultipleOrders.push({ shippoTransactionId: txId, clawbacks: list });
    }
  }

  // exact-double order-level (legacy heuristic, still useful even with ledger present)
  for (const o of allOrders) {
    const label = o.shippingLabelCostCents ?? 0;
    const deducted = o.shippingLabelCostReversedCents ?? 0;
    if (label > 0 && deducted === label * 2) {
      anomalies.exactDoubleLabelCharge.push({
        orderId: o.id,
        labelCostCents: label,
        deductedCents: deducted,
        deltaCents: deducted - label,
      });
    }
  }

  // failed/unknown transaction whose finance row still shows a successful clawback
  for (const f of financeRows) {
    const evidence = liveEvidenceFor(f.shippoTransactionId);
    if (!evidence) continue;
    if ((evidence.verdict === "failed_purchase" || evidence.verdict === "unknown") && labelHasSuccessfulClawback(f)) {
      anomalies.failedTreatedAsCost.push({
        orderId: f.orderId,
        shippoTransactionId: f.shippoTransactionId,
        liveVerdict: evidence.verdict,
        sellerClawbackCents: f.sellerClawbackCents,
        sellerClawbackReversalId: f.sellerClawbackReversalId,
      });
    }
  }

  // replacement chains where prior label is still "active"/chargeable with a clawback AND the
  // new (replacement) label also has a successful clawback — both charged.
  for (const f of financeRows) {
    if (f.purpose !== "replacement" || !f.replacesShippoTransactionId) continue;
    const prior = financeRows.find(
      (p) => p.orderId === f.orderId && p.shippoTransactionId === f.replacesShippoTransactionId,
    );
    if (!prior) continue;
    const priorStillChargeable = isLabelCostChargeable(prior.status) && labelHasSuccessfulClawback(prior);
    const newCharged = labelHasSuccessfulClawback(f);
    if (priorStillChargeable && newCharged) {
      anomalies.replacementBothLabelsCharged.push({
        orderId: f.orderId,
        priorShippoTransactionId: prior.shippoTransactionId,
        priorStatus: prior.status,
        priorClawbackCents: prior.sellerClawbackCents,
        newShippoTransactionId: f.shippoTransactionId,
        newClawbackCents: f.sellerClawbackCents,
      });
    }
  }

  // refunded/voided/failed with successful clawback but no successful credit
  for (const f of financeRows) {
    if (
      (f.status === "refunded" || f.status === "voided" || f.status === "failed_purchase") &&
      labelHasSuccessfulClawback(f) &&
      !labelHasSuccessfulCredit(f)
    ) {
      anomalies.refundedNoSellerCredit.push({
        orderId: f.orderId,
        shippoTransactionId: f.shippoTransactionId,
        status: f.status,
        sellerClawbackCents: f.sellerClawbackCents,
        clawbackFailureDetail: f.clawbackFailureDetail,
        creditFailedAt: f.creditFailedAt,
        creditFailureDetail: f.creditFailureDetail,
      });
    }
  }

  // credited without ever having a successful clawback
  for (const f of financeRows) {
    if (labelHasSuccessfulCredit(f) && !labelHasSuccessfulClawback(f)) {
      anomalies.creditedWithoutClawback.push({
        orderId: f.orderId,
        shippoTransactionId: f.shippoTransactionId,
        sellerCreditCents: f.sellerCreditCents,
        sellerCreditTransferId: f.sellerCreditTransferId,
      });
    }
  }

  // chargeable label cost with zero successful clawback ever
  for (const f of financeRows) {
    if (isLabelCostChargeable(f.status) && f.labelCostCents > 0 && !labelHasSuccessfulClawback(f)) {
      anomalies.labelChargedNoClawback.push({
        orderId: f.orderId,
        shippoTransactionId: f.shippoTransactionId,
        labelCostCents: f.labelCostCents,
        status: f.status,
        clawbackFailedAt: f.clawbackFailedAt,
        clawbackFailureDetail: f.clawbackFailureDetail,
      });
    }
  }

  // seller clawback recorded (order-level legacy) with no successful label evidence at all
  for (const o of allOrders) {
    const finance = financeByOrder.get(o.id) ?? [];
    const reversed = o.shippingLabelCostReversedCents ?? 0;
    if (reversed <= 0) continue;
    const hasAnyChargeableFinance = finance.some((f) => isLabelCostChargeable(f.status) && f.labelCostCents > 0);
    const hasLegacyLabelCost = (o.shippingLabelCostCents ?? 0) > 0;
    if (finance.length > 0 && !hasAnyChargeableFinance) {
      anomalies.clawbackWithNoSuccessfulLabel.push({
        orderId: o.id,
        reversedCents: reversed,
        financeStatuses: finance.map((f) => f.status),
      });
    } else if (finance.length === 0 && !hasLegacyLabelCost) {
      anomalies.clawbackWithNoSuccessfulLabel.push({
        orderId: o.id,
        reversedCents: reversed,
        note: "no ShipmentLabelFinance rows and Order.shippingLabelCostCents is not positive",
      });
    }
  }

  // multiple distinct labels per order (informational — may be legitimate multi-package)
  for (const [orderId, rows] of financeByOrder) {
    const distinctTx = new Set(rows.map((r) => r.shippoTransactionId));
    if (distinctTx.size > 1) {
      anomalies.multipleLabelsPerOrder.push({
        orderId,
        distinctShippoTransactionIds: [...distinctTx],
        purposes: rows.map((r) => ({ shippoTransactionId: r.shippoTransactionId, purpose: r.purpose, status: r.status })),
      });
    }
  }

  // bundled live-session double attribution: more than one order in the same session shows a
  // positive Order.shippingLabelCostCents for the SAME shippoTransactionId (should be exactly one
  // debit order per bundled-labels.ts design; siblings should show 0).
  const ordersBySession = new Map<string, OrderRow[]>();
  for (const o of allOrders) {
    if (!o.liveShippingSessionId) continue;
    const l = ordersBySession.get(o.liveShippingSessionId) ?? [];
    l.push(o);
    ordersBySession.set(o.liveShippingSessionId, l);
  }
  for (const [sessionId, sOrders] of ordersBySession) {
    const withPositiveLabelCost = sOrders.filter((o) => (o.shippingLabelCostCents ?? 0) > 0);
    if (withPositiveLabelCost.length > 1) {
      const byTx = new Map<string, OrderRow[]>();
      for (const o of withPositiveLabelCost) {
        const tx = o.shippoTransactionId ?? "unknown";
        const l = byTx.get(tx) ?? [];
        l.push(o);
        byTx.set(tx, l);
      }
      for (const [tx, os] of byTx) {
        if (os.length > 1) {
          anomalies.bundledSessionDoubleAttribution.push({
            liveShippingSessionId: sessionId,
            shippoTransactionId: tx,
            orderIds: os.map((o) => o.id),
            labelCostCentsEach: os.map((o) => o.shippingLabelCostCents),
          });
        }
      }
    }
  }

  // --- SECTION 4 / 5: totals -------------------------------------------------------------------
  let totalSuccessfulShippoChargesCents = 0;
  let totalShippoRefundsCents = 0;
  let totalSellerClawbacksCents = 0;
  let totalSellerCreditsCents = 0;
  let totalBuyerShippingCollectedCents = 0;
  for (const r of ledgerRows) {
    totalSuccessfulShippoChargesCents += r.successfulLabelCostCents;
    totalShippoRefundsCents += r.liveConfirmedShippoRefundCents;
    totalSellerClawbacksCents += r.actualSellerClawbackCents;
    totalSellerCreditsCents += r.actualSellerCreditCents;
    if (r.paymentStatus === "paid" || r.paymentStatus === "layaway_completed") {
      totalBuyerShippingCollectedCents += r.buyerShippingCollectedCents;
    }
  }
  const netShippoCostCents = totalSuccessfulShippoChargesCents - totalShippoRefundsCents;
  const netSellerRecoveryCents = totalSellerClawbacksCents - totalSellerCreditsCents;
  const unexplainedDifferenceCents = netSellerRecoveryCents - netShippoCostCents;
  const gvShippingProfitLossCents = netSellerRecoveryCents - netShippoCostCents; // same figure, kept separate name for report section 7

  // --- SECTION 6: Shippo billing exposure -------------------------------------------------------
  const billingExposure: unknown[] = [];
  for (const txId of txIdList) {
    const e = evidenceByTx.get(txId);
    if (!e || "__error" in e) continue;
    const raw = (e.rawTransaction ?? {}) as Record<string, unknown>;
    const rate = raw.rate as Record<string, unknown> | undefined;
    const rateAmountCents = rate ? centsFromUsdString(rate.amount as string | number | undefined) : null;
    const financeForTx = financeRows.filter((f) => f.shippoTransactionId === txId);
    const recordedCents = financeForTx.length > 0 ? financeForTx[0]!.labelCostCents : null;
    const hasBillingField = "billing" in raw;
    const mismatch =
      rateAmountCents != null && recordedCents != null && recordedCents > 0 && rateAmountCents !== recordedCents;
    if (hasBillingField || mismatch) {
      billingExposure.push({
        shippoTransactionId: txId,
        shippoRateAmountCents: rateAmountCents,
        gvRecordedLabelCostCents: recordedCents,
        mismatch,
        hasBillingField,
        billingRaw: hasBillingField ? raw.billing : null,
      });
    }
  }

  // --- Final report -----------------------------------------------------------------------------
  const report = {
    mode: "AUDIT_READONLY",
    generatedAt: new Date().toISOString(),
    liveShippoVerificationEnabled: liveShippoAvailable,
    ordersScanned: allOrders.length,
    distinctShippoTransactionIds: txIdList.length,
    shipmentLabelFinanceRowCount: financeRows.length,

    section1_shippoSourceOfTruth: {
      buckets: {
        successfulPurchasedLabelsCount: section1Buckets.successfulPurchasedLabels.length,
        failedOrErrorCount: section1Buckets.failedOrErrorTransactions.length,
        voidedCount: section1Buckets.voidedLabels.length,
        refundedCount: section1Buckets.refundedLabels.length,
        refundPendingCount: section1Buckets.refundPending.length,
        replacementOrRegeneratedCount: section1Buckets.replacementOrRegenerated.length,
        duplicateTransactionsAcrossOrdersCount: section1Buckets.duplicateTransactionsAcrossOrders.length,
        transactionsWithNoGvOrderCount: section1Buckets.transactionsWithNoGvOrder.length,
        unknownOrUnverifiableCount: section1Buckets.unknownOrUnverifiable.length,
      },
      buckets_ids: section1Buckets,
      perTransaction: txClassification,
    },

    section2_orderLevelLedger: {
      rowCount: ledgerRows.length,
      flaggedCount: ledgerRows.filter((r) => r.flagged).length,
      legacyNoLedgerCount: ledgerRows.filter((r) => r.source === "legacy_order_fields_only").length,
      rows: ledgerRows,
    },

    section3_doubleChargeAudit: {
      counts: Object.fromEntries(Object.entries(anomalies).map(([k, v]) => [k, v.length])),
      details: anomalies,
    },

    section4_shippoVsGetVaulted: {
      totalSuccessfulShippoChargesUsd: usd(totalSuccessfulShippoChargesCents),
      totalActualShippoRefundsUsd: usd(totalShippoRefundsCents),
      netAmountShippoShouldHaveCostGvUsd: usd(netShippoCostCents),
      totalSellerClawbacksUsd: usd(totalSellerClawbacksCents),
      totalSellerCreditsUsd: usd(totalSellerCreditsCents),
      netAmountGvActuallyRecoveredFromSellersUsd: usd(netSellerRecoveryCents),
      unexplainedDifferenceUsd: usd(unexplainedDifferenceCents),
    },

    section5_buyerShipping: {
      totalBuyerShippingCollectedUsd: usd(totalBuyerShippingCollectedCents),
      netActualShippoLabelCostsUsd: usd(netShippoCostCents),
      netSellerClawbacksUsd: usd(netSellerRecoveryCents),
    },

    section6_shippoBillingExposure: {
      note:
        "Only per-transaction rate vs. recorded-cost mismatches and any 'billing' field Shippo returned on " +
        "the transaction object can be checked from our database + the Shippo Transactions API. Shippo " +
        "account-level charges — monthly platform/subscription fees, ACH/card auto-recharges to your Shippo " +
        "balance, carrier insurance or signature surcharges billed outside the per-label rate, and any " +
        "carrier rate adjustments — do NOT appear on the /transactions/ endpoint at all. To fully reconcile " +
        "the real Shippo bill, export from the Shippo dashboard: Settings → Billing → Invoices/Statements " +
        "(full monthly statement), Settings → Billing → Payment history (every card/ACH charge to Shippo), " +
        "and Settings → Billing → Insurance (if declared-value insurance is used on any label).",
      mismatchOrBillingFieldCount: billingExposure.length,
      rows: billingExposure,
    },

    section7_reportTotals: {
      totalLabels: txIdList.length,
      successfulLabels: section1Buckets.successfulPurchasedLabels.length,
      failedLabels: section1Buckets.failedOrErrorTransactions.length,
      refundedLabels: section1Buckets.refundedLabels.length,
      replacementLabels: section1Buckets.replacementOrRegenerated.length,
      totalShippoGrossChargesUsd: usd(totalSuccessfulShippoChargesCents),
      totalShippoRefundsUsd: usd(totalShippoRefundsCents),
      netShippoCostUsd: usd(netShippoCostCents),
      totalSellerClawbacksUsd: usd(totalSellerClawbacksCents),
      totalSellerCreditsUsd: usd(totalSellerCreditsCents),
      netSellerRecoveryUsd: usd(netSellerRecoveryCents),
      totalBuyerShippingCollectedUsd: usd(totalBuyerShippingCollectedCents),
      exactGvShippingProfitLossUsd: usd(gvShippingProfitLossCents),
      mismatchedOrderCount: ledgerRows.filter((r) => r.flagged).length,
    },
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
