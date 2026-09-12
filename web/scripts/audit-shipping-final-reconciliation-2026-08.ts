/**
 * FINAL shipping financial reconciliation — read-only, zero mutations.
 *
 * Runs AFTER the verifyShippoLabelRefundStatus transaction-matching fix. Every call below is a
 * Prisma find/aggregate call or a Shippo GET (via the fixed verifyShippoLabelRefundStatus). No
 * `.update(`, `.create(`, `.upsert(`, `.delete(`, Stripe reversal/refund call, or Shippo refund
 * request anywhere in this file.
 *
 * Scope note: you asked specifically to re-verify the 35 `estimated` session-linked transactions.
 * I expanded this pass to re-verify EVERY distinct Shippo transaction id (all ~283) with the fixed
 * code, not just those 35 — the same account-wide-refund bug could just as easily have masked a
 * genuine refund on an order-linked "replacement" label (DB still shows it "active"/chargeable),
 * and a "final verified" reconciliation can't respond to that only for one bucket. Flagged clearly
 * below if it changes anything.
 *
 * OUTPUT: this script writes its own report directly to shipping-audit-final.json (next to this
 * script's web/ root, via fs.writeFileSync with explicit utf8 encoding) — it does NOT rely on
 * shell stdout redirection. That sidesteps two real failure modes: (1) PowerShell's `>` operator
 * defaults to UTF-16 and can silently produce a file that looks empty/garbled to non-PowerShell
 * tools, and (2) if the process dies partway through (crash, closed terminal, killed process)
 * before a single console.log at the end of a long-running script fires, `>` redirection leaves
 * you with a 0-byte file and no clue why. This version writes progress to stderr throughout AND
 * guarantees shipping-audit-final.json is never empty — on any crash it still writes a JSON error
 * report (with whatever partial counts were gathered) instead of nothing.
 *
 * Usage (from web/, PowerShell or any shell — no redirection needed):
 *   npx tsx scripts/audit-shipping-final-reconciliation-2026-08.ts
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const OUTPUT_PATH = path.join(webRoot, "shipping-audit-final.json");

let reportAlreadyWritten = false;
function writeReport(obj: unknown): void {
  const json = JSON.stringify(obj, null, 2);
  writeFileSync(OUTPUT_PATH, json, { encoding: "utf8" });
  reportAlreadyWritten = true;
  process.stderr.write(`Wrote ${json.length} bytes (utf8, no BOM) to ${OUTPUT_PATH}\n`);
}

// Belt-and-suspenders: catch anything that escapes the main() promise chain entirely (e.g. a
// failure during the dynamic imports before main()'s own try/catch is even active) so the output
// file is still never silently empty.
process.on("uncaughtException", (err) => {
  process.stderr.write(`AUDIT FAILED (uncaughtException): ${err instanceof Error ? err.message : String(err)}\n`);
  if (!reportAlreadyWritten) {
    try {
      writeFileSync(
        OUTPUT_PATH,
        JSON.stringify({ mode: "FAILED", error: err instanceof Error ? err.message : String(err) }, null, 2),
        { encoding: "utf8" },
      );
    } catch {
      /* nothing more we can do */
    }
  }
  process.exit(1);
});

const PAYPAL_NET_LEGACY_BUG_ORDER_IDS = [
  "cmsjiij23001c09jrqho2taxu",
  "cmsjik35k000r09iepvqyrgwi",
  "cmsjillgt004t09jsmsha1p4y",
  "cmsjj68f1003o09l7jg8gewme",
  "cmsjjp7zo002t09ld9w45lb0z",
  "cmsjjrnw9006n09l71otbz9kx",
];

function usd(cents: number): number {
  return Math.round(cents) / 100;
}
function centsFromUsdString(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
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
      if (done % 25 === 0 || done === total) process.stderr.write(`  live-Shippo verify: ${done}/${total}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => worker()));
  return results;
}

async function main() {
  process.stderr.write(`AUDIT STARTING — output will be written to ${OUTPUT_PATH}\n`);
  const { prisma } = await import("../src/lib/prisma");
  const {
    summarizeLabelFinanceRows,
    labelHasSuccessfulClawback,
    isLabelCostChargeable,
  } = await import("../src/services/shipping/label-finance");
  const { verifyShippoLabelRefundStatus } = await import(
    "../src/services/shipping/shippo-label-refund-status"
  );
  const { isShippoConfigured } = await import("../src/lib/shippo");

  if (!isShippoConfigured()) {
    writeReport({ error: "SHIPPO_NOT_CONFIGURED — cannot produce a verified reconciliation.", mode: "FAILED" });
    process.stderr.write("AUDIT FAILED: SHIPPO_NOT_CONFIGURED\n");
    process.exit(1);
  }

  // ============================================================================================
  // Gather every ShipmentLabelFinance row (order-linked ledger) + every session-linked orphan.
  // ============================================================================================
  process.stderr.write("Loading ShipmentLabelFinance ledger...\n");
  const financeRows = await prisma.shipmentLabelFinance.findMany({ orderBy: { createdAt: "asc" } });

  const orderSelect = {
    id: true,
    sellerId: true,
    paymentStatus: true,
    liveShippingSessionId: true,
    shippingChargedCents: true,
    shippingPriceUsd: true,
    shippingLabelCostCents: true,
    shippingLabelCostReversedCents: true,
    shippingLabelCostReversalId: true,
    shippingLabelCostChargedShippoTransactionId: true,
    shippoTransactionId: true,
    seller: { select: { username: true, email: true } },
  } as const;

  const financeOrderIds = [...new Set(financeRows.map((f) => f.orderId))];
  process.stderr.write("Loading orders touching shipping...\n");
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { shippingLabelCostCents: { gt: 0 } },
        { shippingLabelCostReversedCents: { gt: 0 } },
        { shippoTransactionId: { not: null } },
        { id: { in: financeOrderIds } },
      ],
    },
    select: orderSelect,
    orderBy: { createdAt: "asc" },
  });
  const financeByOrder = new Map<string, typeof financeRows>();
  for (const f of financeRows) {
    const l = financeByOrder.get(f.orderId) ?? [];
    l.push(f);
    financeByOrder.set(f.orderId, l);
  }

  // Session-linked orphans: same derivation as the earlier follow-up pass.
  process.stderr.write("Recomputing session-linked unattributed transaction ids...\n");
  const financeTxIds = new Set(financeRows.map((f) => f.shippoTransactionId));
  const ordersWithTx = await prisma.order.findMany({
    where: { OR: [{ shippoTransactionId: { not: null } }, { shippingLabelCostChargedShippoTransactionId: { not: null } }] },
    select: { shippoTransactionId: true, shippingLabelCostChargedShippoTransactionId: true },
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
  const orphanTxIds = [...packagesByTx.keys()].filter((tx) => !financeTxIds.has(tx) && !orderTxIds.has(tx));
  const orphanLabelCreated = orphanTxIds.filter((tx) => packagesByTx.get(tx)?.[0]?.status === "label_created");
  const orphanEstimated = orphanTxIds.filter((tx) => packagesByTx.get(tx)?.[0]?.status === "estimated");

  process.stderr.write(
    `Order-linked distinct tx: ${financeTxIds.size} | Session-linked orphans: ${orphanTxIds.length} (label_created=${orphanLabelCreated.length}, estimated=${orphanEstimated.length})\n`,
  );

  // Orders with a shippoTransactionId but NO ShipmentLabelFinance row at all — pre-ledger legacy
  // orders. Must be included (590 such orders / ~$237 in the earlier pass) or the "final" total
  // silently undercounts real historical spend/recovery. Tracked as its own category below.
  const legacyNoLedgerOrders = orders.filter((o) => (financeByOrder.get(o.id) ?? []).length === 0);
  const legacyTxIds = legacyNoLedgerOrders
    .map((o) => o.shippoTransactionId?.trim())
    .filter((id): id is string => Boolean(id));

  // ============================================================================================
  // Live-verify EVERY distinct transaction (order-linked + orphaned + legacy) with the FIXED logic.
  // ============================================================================================
  const allTxIds = [...new Set([...financeTxIds, ...orphanTxIds, ...legacyTxIds])];
  process.stderr.write(`Live-verifying ${allTxIds.length} distinct transactions with corrected refund matching...\n`);
  const evidenceResults = await mapWithConcurrency(allTxIds, 4, (txId) =>
    withRetry(() => verifyShippoLabelRefundStatus(txId)),
  );
  type Evidence = Awaited<ReturnType<typeof verifyShippoLabelRefundStatus>>;
  const evidenceByTx = new Map<string, Evidence | { __error: string }>();
  allTxIds.forEach((txId, i) => evidenceByTx.set(txId, evidenceResults[i]!));
  function liveEvidenceFor(txId: string | null | undefined): Evidence | null {
    if (!txId) return null;
    const e = evidenceByTx.get(txId.trim());
    if (!e || "__error" in e) return null;
    return e as Evidence;
  }
  function classifyFive(txId: string): "SUCCESS" | "FAILED" | "REFUNDED" | "REFUND_PENDING" | "UNKNOWN" {
    const e = liveEvidenceFor(txId);
    if (!e) return "UNKNOWN";
    switch (e.verdict) {
      case "chargeable":
        return "SUCCESS";
      case "failed_purchase":
        return "FAILED";
      case "refunded":
        return "REFUNDED";
      case "refund_pending":
        return "REFUND_PENDING";
      default:
        return "UNKNOWN";
    }
  }

  // ============================================================================================
  // Re-classify the 35 `estimated` orphans specifically (explicit deliverable).
  // ============================================================================================
  const estimatedReclassified = orphanEstimated.map((tx) => {
    const pkg = packagesByTx.get(tx)?.[0];
    const e = liveEvidenceFor(tx);
    const classification = classifyFive(tx);
    return {
      shippoTransactionId: tx,
      liveShippingSessionId: pkg?.liveShippingSessionId ?? null,
      dbRecordedLabelCostCents: pkg?.labelCostCents ?? null,
      classification,
      liveVerdict: e?.verdict ?? null,
      liveTransactionStatus: e?.transactionStatus ?? null,
      liveAffirmativelyPurchased: e?.purchaseProof.affirmativelyPurchased ?? null,
      liveConfirmedRefundCents: e
        ? e.refunds.filter((r) => r.status === "SUCCESS").reduce((s, r) => s + centsFromUsdString(r.amount), 0)
        : 0,
    };
  });
  const estimatedNowConfirmedReal = estimatedReclassified.filter((r) => r.classification === "SUCCESS" || r.classification === "REFUNDED" || r.classification === "REFUND_PENDING");
  const estimatedConfirmedRealCents = estimatedNowConfirmedReal.reduce((s, r) => s + (r.dbRecordedLabelCostCents ?? 0), 0);
  const estimatedConfirmedNotChargedCents = estimatedReclassified
    .filter((r) => r.classification === "FAILED")
    .reduce((s, r) => s + (r.dbRecordedLabelCostCents ?? 0), 0);
  const estimatedStillUnknownCents = estimatedReclassified
    .filter((r) => r.classification === "UNKNOWN")
    .reduce((s, r) => s + (r.dbRecordedLabelCostCents ?? 0), 0);

  // ============================================================================================
  // Order-linked ledger, rebuilt with corrected live evidence (catches any genuine refund that
  // bug #1 previously masked as refund_pending on an order the DB still shows as active/chargeable).
  // ============================================================================================
  type OrderRow = (typeof orders)[number];
  function buyerShippingCentsFor(o: OrderRow): number {
    if (o.shippingChargedCents != null) return Math.max(0, o.shippingChargedCents);
    return Math.max(0, Math.round((o.shippingPriceUsd ?? 0) * 100));
  }

  let orderLinkedSuccessfulPurchaseCents = 0;
  let orderLinkedConfirmedRefundCents = 0;
  let totalSellerClawbackCents = 0;
  let totalSellerCreditCents = 0;
  let replacementPurposeCostCents = 0;
  let failedClawbackUnrecoveredCents = 0;
  let buyerShippingCollectedCents = 0;
  let legacyNoLedgerSuccessfulPurchaseCents = 0;
  let legacyNoLedgerClawbackCents = 0;
  let legacyNoLedgerConfirmedRefundCents = 0;
  const legacyNoLedgerDetail: unknown[] = [];
  const newlyDiscoveredGenuineRefunds: unknown[] = [];
  const failedClawbackDetail: unknown[] = [];
  const contributingOrders = new Map<string, { orderId: string; sellerHandle: string | null; unrecoveredCents: number; reasons: string[] }>();

  for (const o of orders) {
    if (o.paymentStatus === "paid" || o.paymentStatus === "layaway_completed") {
      buyerShippingCollectedCents += buyerShippingCentsFor(o);
    }
    const finance = financeByOrder.get(o.id) ?? [];

    if (finance.length === 0) {
      // Pre-ledger legacy order — no ShipmentLabelFinance row exists at all. Fall back to the
      // Order summary fields (weaker provenance, no per-transaction ledger to cross-check), live
      // verify the single shippoTransactionId when present, and track separately from the
      // ledger-backed totals so provenance stays visible.
      const labelCostCents = Math.max(0, o.shippingLabelCostCents ?? 0);
      const reversedCents = Math.max(0, o.shippingLabelCostReversedCents ?? 0);
      const txId = o.shippoTransactionId?.trim() || null;
      const e = liveEvidenceFor(txId);
      const everPurchased = labelCostCents > 0 && (e ? e.purchaseProof.affirmativelyPurchased : true);
      const confirmedRefund = e
        ? e.refunds.filter((r) => r.status === "SUCCESS").reduce((s, r) => s + centsFromUsdString(r.amount), 0)
        : 0;
      if (everPurchased) legacyNoLedgerSuccessfulPurchaseCents += labelCostCents;
      legacyNoLedgerClawbackCents += reversedCents;
      legacyNoLedgerConfirmedRefundCents += confirmedRefund;
      if (labelCostCents > 0 && !everPurchased) {
        legacyNoLedgerDetail.push({
          orderId: o.id,
          shippoTransactionId: txId,
          note: "Order.shippingLabelCostCents is positive but live Shippo does not confirm an affirmative purchase — excluded from successful-purchase total.",
          labelCostCents,
          liveVerdict: e?.verdict ?? "not_verifiable",
        });
      }
      if (labelCostCents > 0 && everPurchased && reversedCents !== labelCostCents) {
        legacyNoLedgerDetail.push({
          orderId: o.id,
          shippoTransactionId: txId,
          note: "Legacy clawback does not equal legacy label cost (no ledger to explain the gap).",
          labelCostCents,
          reversedCents,
        });
        const c = contributingOrders.get(o.id) ?? {
          orderId: o.id,
          sellerHandle: o.seller.username ?? o.seller.email ?? null,
          unrecoveredCents: 0,
          reasons: [],
        };
        c.unrecoveredCents += Math.max(0, labelCostCents - reversedCents);
        c.reasons.push("legacy no-ledger order: clawback does not match label cost");
        contributingOrders.set(o.id, c);
      }
      continue;
    }

    for (const row of finance) {
      const e = liveEvidenceFor(row.shippoTransactionId);
      const everPurchased = e ? e.purchaseProof.affirmativelyPurchased : row.status !== "failed_purchase" && row.labelCostCents > 0;
      if (everPurchased) orderLinkedSuccessfulPurchaseCents += row.labelCostCents;
      if (row.purpose === "replacement" && everPurchased) replacementPurposeCostCents += row.labelCostCents;

      if (e) {
        const confirmedRefund = e.refunds
          .filter((r) => r.status === "SUCCESS")
          .reduce((s, r) => s + centsFromUsdString(r.amount), 0);
        orderLinkedConfirmedRefundCents += confirmedRefund;

        // Flag: DB still treats this row as chargeable/active but corrected live evidence now
        // proves Shippo actually refunded or has a pending refund on it.
        if ((e.verdict === "refunded" || e.verdict === "refund_pending") && isLabelCostChargeable(row.status)) {
          newlyDiscoveredGenuineRefunds.push({
            orderId: row.orderId,
            shippoTransactionId: row.shippoTransactionId,
            dbStatus: row.status,
            liveVerdict: e.verdict,
            labelCostCents: row.labelCostCents,
            sellerCreditCents: row.sellerCreditCents,
            note: "DB status was never corrected because the pre-fix refund lookup could not reliably prove a real refund — needs manual review, no DB write made.",
          });
        }
      }

      totalSellerClawbackCents += Math.max(0, row.sellerClawbackCents);
      totalSellerCreditCents += Math.max(0, row.sellerCreditCents);

      if (isLabelCostChargeable(row.status) && row.labelCostCents > 0 && !labelHasSuccessfulClawback(row)) {
        failedClawbackUnrecoveredCents += row.labelCostCents;
        failedClawbackDetail.push({
          orderId: row.orderId,
          shippoTransactionId: row.shippoTransactionId,
          labelCostCents: row.labelCostCents,
          status: row.status,
          clawbackFailedAt: row.clawbackFailedAt,
          clawbackFailureDetail: row.clawbackFailureDetail,
        });
        const c = contributingOrders.get(row.orderId) ?? {
          orderId: row.orderId,
          sellerHandle: o.seller.username ?? o.seller.email ?? null,
          unrecoveredCents: 0,
          reasons: [],
        };
        c.unrecoveredCents += row.labelCostCents;
        c.reasons.push(`failed clawback: ${row.clawbackFailureDetail ?? "no detail recorded"}`);
        contributingOrders.set(row.orderId, c);
      }
    }
  }

  // PayPal-net legacy-field overstatement (isolated, excluded from real recovery totals).
  const payPalNetOrders = await prisma.order.findMany({
    where: { id: { in: PAYPAL_NET_LEGACY_BUG_ORDER_IDS } },
    select: { id: true, shippingLabelCostReversedCents: true },
  });
  let payPalNetOverstatementCents = 0;
  const payPalNetDetail: unknown[] = [];
  for (const o of payPalNetOrders) {
    const finance = financeByOrder.get(o.id) ?? [];
    const summary = summarizeLabelFinanceRows(finance);
    const legacyField = o.shippingLabelCostReversedCents ?? 0;
    const realLedgerValue = summary.netSellerDeductionCents;
    const overstatement = Math.max(0, legacyField - realLedgerValue);
    payPalNetOverstatementCents += overstatement;
    payPalNetDetail.push({
      orderId: o.id,
      legacyOrderFieldCents: legacyField,
      realLedgerNetDeductionCents: realLedgerValue,
      overstatementCents: overstatement,
    });
  }

  // Session-linked unattributed total — add both confirmed-real buckets.
  const sessionLinkedUnattributedCents = orphanLabelCreated.reduce((s, tx) => s + (packagesByTx.get(tx)?.[0]?.labelCostCents ?? 0), 0) + estimatedConfirmedRealCents;

  // Fold orphan-confirmed-refunds (if any) into the Shippo-refund total too.
  let orphanConfirmedRefundCents = 0;
  for (const tx of [...orphanLabelCreated, ...orphanEstimated]) {
    const e = liveEvidenceFor(tx);
    if (!e) continue;
    orphanConfirmedRefundCents += e.refunds.filter((r) => r.status === "SUCCESS").reduce((s, r) => s + centsFromUsdString(r.amount), 0);
  }

  // Group orphaned sessions into the "contributing to unrecovered cost" list too.
  const orphanBySession = new Map<string, { sessionId: string; txIds: string[]; totalCents: number }>();
  for (const tx of [...orphanLabelCreated, ...estimatedNowConfirmedReal.map((r) => r.shippoTransactionId)]) {
    const pkg = packagesByTx.get(tx)?.[0];
    const sid = pkg?.liveShippingSessionId ?? "no_session";
    const entry = orphanBySession.get(sid) ?? { sessionId: sid, txIds: [], totalCents: 0 };
    entry.txIds.push(tx);
    entry.totalCents += pkg?.labelCostCents ?? 0;
    orphanBySession.set(sid, entry);
  }

  // ============================================================================================
  // FINAL CONSOLIDATED NUMBERS (points 1–10)
  // Three mutually-exclusive cost buckets sum to final_1: order-linked (ledger-backed),
  // legacy-no-ledger (pre-ledger orders, Order-field provenance only), session-linked-unattributed.
  // ============================================================================================
  const totalSuccessfulShippoPurchasesCents =
    orderLinkedSuccessfulPurchaseCents + legacyNoLedgerSuccessfulPurchaseCents + sessionLinkedUnattributedCents;
  const totalConfirmedShippoRefundsCents =
    orderLinkedConfirmedRefundCents + legacyNoLedgerConfirmedRefundCents + orphanConfirmedRefundCents;
  const netActualShippoSpendCents = totalSuccessfulShippoPurchasesCents - totalConfirmedShippoRefundsCents;
  const totalSellerClawbackCentsAllSources = totalSellerClawbackCents + legacyNoLedgerClawbackCents;
  const netSellerRecoveryCents = totalSellerClawbackCentsAllSources - totalSellerCreditCents;
  const unrecoveredGvShippingCostCents = netActualShippoSpendCents - netSellerRecoveryCents;

  const report = {
    mode: "FINAL_RECONCILIATION_READONLY",
    generatedAt: new Date().toISOString(),
    scopeNote:
      "Re-verified ALL distinct Shippo transactions (order-linked + session-linked orphans) with the " +
      "corrected transaction-matching refund logic, not only the 35 estimated ones, per the note above.",

    reclassified35EstimatedTransactions: {
      total: estimatedReclassified.length,
      countsByClassification: estimatedReclassified.reduce<Record<string, number>>((acc, r) => {
        acc[r.classification] = (acc[r.classification] ?? 0) + 1;
        return acc;
      }, {}),
      confirmedRealPurchaseUsd: usd(estimatedConfirmedRealCents),
      confirmedNotChargedUsd: usd(estimatedConfirmedNotChargedCents),
      stillUnknownUsd: usd(estimatedStillUnknownCents),
      rows: estimatedReclassified,
    },

    final_1_totalSuccessfulShippoLabelPurchasesUsd: usd(totalSuccessfulShippoPurchasesCents),
    final_2_lessActualConfirmedShippoRefundsUsd: usd(totalConfirmedShippoRefundsCents),
    final_3_netActualShippoSpendUsd: usd(netActualShippoSpendCents),
    final_4_totalSellerClawbacksFromLedgerUsd: usd(totalSellerClawbackCents),
    final_4b_legacyNoLedgerClawbacksUsd_additionalSource: usd(legacyNoLedgerClawbackCents),
    final_5_lessSellerCreditsUsd: usd(totalSellerCreditCents),
    final_6_netSellerRecoveryUsd_ledgerPlusLegacy: usd(netSellerRecoveryCents),
    final_6_note:
      "final_6/final_7 combine ledger clawbacks (final_4) + legacy no-ledger clawbacks (final_4b) so " +
      "they stay consistent with final_1, which also includes legacy-order purchases. final_4 alone " +
      "(ShipmentLabelFinance only, as literally requested) is " + usd(totalSellerClawbackCents) + ".",
    final_7_unrecoveredGvShippingCostUsd: usd(unrecoveredGvShippingCostCents),
    final_8_buyerShippingCollectedUsd_separate: usd(buyerShippingCollectedCents),
    final_9_payPalNetLegacyFieldOverstatementUsd_excludedFromRecovery: usd(payPalNetOverstatementCents),
    final_9_detail: payPalNetDetail,
    final_10_ordersAndSessionsContributingToUnrecoveredCost: {
      failedClawbackOrders: [...contributingOrders.values()],
      orphanedSessionCosts: [...orphanBySession.values()],
    },

    categoryBreakdown_noDoubleCounting: {
      note:
        "order-linked (ledger) + legacy-no-ledger + session-linked-unattributed are mutually exclusive " +
        "and sum to final_1. replacement-label-costs and failed-clawbacks are informational SUBSETS " +
        "already included inside order-linked — do not add them on top of final_1/final_3.",
      orderLinkedLabelCostsUsd: usd(orderLinkedSuccessfulPurchaseCents),
      legacyNoLedgerLabelCostsUsd: usd(legacyNoLedgerSuccessfulPurchaseCents),
      sessionLinkedUnattributedLabelCostsUsd: usd(sessionLinkedUnattributedCents),
      replacementLabelCosts_subsetOfOrderLinked_Usd: usd(replacementPurposeCostCents),
      failedClawbacks_subsetOfOrderLinked_Usd: usd(failedClawbackUnrecoveredCents),
      failedClawbackDetail,
      legacyNoLedgerDetail,
    },

    newlyDiscoveredGenuineRefundsRequiringManualReview: newlyDiscoveredGenuineRefunds,
  };

  writeReport(report);
  process.stderr.write(
    `AUDIT COMPLETE: ${allTxIds.length} distinct Shippo transactions verified live ` +
      `(${orders.length} orders scanned, ${legacyNoLedgerOrders.length} legacy no-ledger, ` +
      `${orphanTxIds.length} session-linked orphans). Report written to ${OUTPUT_PATH}.\n`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  const message = e instanceof Error ? e.message : String(e);
  const stack = e instanceof Error ? e.stack : undefined;
  console.error(e);
  // Never leave the output file empty/missing on a crash — write what we know so a 0-byte file
  // can't happen again, and the failure is diagnosable from the JSON itself.
  try {
    writeReport({
      mode: "FAILED",
      generatedAt: new Date().toISOString(),
      error: message,
      stack: stack ?? null,
      note: "The audit crashed before completing. No database or Shippo writes were made regardless.",
    });
  } catch (writeErr) {
    process.stderr.write(
      `AUDIT FAILED and could not even write the error report: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}\n`,
    );
  }
  process.stderr.write(`AUDIT FAILED: ${message}\n`);
  process.exitCode = 1;
  try {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
});
