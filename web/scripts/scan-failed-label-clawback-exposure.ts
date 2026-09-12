/**
 * Complete read-only historical exposure scan for improper seller label clawbacks
 * on failed/invalid Shippo purchases.
 *
 * Usage:
 *   npx tsx scripts/scan-failed-label-clawback-exposure.ts
 *   npx tsx scripts/scan-failed-label-clawback-exposure.ts --out=reports/label-clawback-exposure
 *
 * Writes JSON report + repair manifest (JSON + CSV). No mutations. No secrets.
 */
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const outArg = process.argv.find((a) => a.startsWith("--out="));
const OUT_BASE = outArg
  ? path.resolve(webRoot, outArg.slice("--out=".length))
  : path.join(webRoot, "reports", "label-clawback-exposure");

/** Confirmed original repair — do not change. */
const ORIGINAL_ORDER_ID = "cmrr427ae000909kyjrurbm1r";
const ORIGINAL_CREDIT_CENTS = 3502;
const ORIGINAL_IDEMPOTENCY_KEY = `failed_label_clawback_credit_${ORIGINAL_ORDER_ID}_3502`;
const ORIGINAL_CLASSIFICATION = "NEITHER_LABEL_CHARGED";

export type RepairClassification =
  | "FAILED_LABEL_CLAWBACK_CREDIT_REQUIRED"
  | "PARTIAL_FAILED_LABEL_CLAWBACK_CREDIT_REQUIRED"
  | "VALID_SUCCESSFUL_LABEL_CHARGE"
  | "REFUND_PENDING"
  | "MANUAL_REVIEW_REQUIRED"
  | "NEITHER_LABEL_CHARGED";

type TxEvidence = {
  shippoTransactionId: string;
  status: string | null;
  objectState: string | null;
  labelUrl: string | null;
  trackingNumber: string | null;
  billingPaymentsCount: number | null;
  messages: string[];
  verdict: string;
  provenNoShippoCharge: boolean;
  quotedLabelCostCents: number | null;
  affirmativelyPurchased: boolean;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildRepairIdempotencyKey(orderId: string, creditCents: number): string {
  if (orderId === ORIGINAL_ORDER_ID && creditCents === ORIGINAL_CREDIT_CENTS) {
    return ORIGINAL_IDEMPOTENCY_KEY;
  }
  return `failed_label_clawback_credit_${orderId}_${creditCents}`;
}

function classifyOrder(args: {
  orderId: string;
  txEvidence: TxEvidence[];
  grossClawbackCents: number;
  existingCreditCents: number;
  proposedCreditCents: number;
}): {
  classification: RepairClassification;
  manualReviewReason: string | null;
} {
  if (args.orderId === ORIGINAL_ORDER_ID && args.proposedCreditCents === ORIGINAL_CREDIT_CENTS) {
    return { classification: ORIGINAL_CLASSIFICATION, manualReviewReason: null };
  }

  const verdicts = args.txEvidence.map((t) => t.verdict);
  if (verdicts.some((v) => v === "refund_pending")) {
    return {
      classification: "REFUND_PENDING",
      manualReviewReason: "At least one Shippo refund is still pending.",
    };
  }
  if (verdicts.some((v) => v === "unknown") || args.txEvidence.length === 0) {
    return {
      classification: "MANUAL_REVIEW_REQUIRED",
      manualReviewReason:
        args.txEvidence.length === 0
          ? "No Shippo transaction ids found while seller clawback is present."
          : "Shippo evidence incomplete or inconclusive (not classified from empty refund lists).",
    };
  }

  const failed = args.txEvidence.filter(
    (t) => t.verdict === "failed_purchase" || t.provenNoShippoCharge,
  );
  const chargeable = args.txEvidence.filter((t) => t.verdict === "chargeable");
  const refunded = args.txEvidence.filter((t) => t.verdict === "refunded");

  if (failed.length > 0 && chargeable.length === 0 && refunded.length === 0) {
    return {
      classification: "FAILED_LABEL_CLAWBACK_CREDIT_REQUIRED",
      manualReviewReason: null,
    };
  }
  if (failed.length > 0 && chargeable.length > 0) {
    return {
      classification: "PARTIAL_FAILED_LABEL_CLAWBACK_CREDIT_REQUIRED",
      manualReviewReason: null,
    };
  }
  if (chargeable.length > 0 && failed.length === 0) {
    return {
      classification: "VALID_SUCCESSFUL_LABEL_CHARGE",
      manualReviewReason: null,
    };
  }
  if (refunded.length > 0 && chargeable.length > 0) {
    return {
      classification: "PARTIAL_FAILED_LABEL_CLAWBACK_CREDIT_REQUIRED",
      manualReviewReason: "Prior label refunded; confirm credit covers only refunded/failed attempts.",
    };
  }
  return {
    classification: "MANUAL_REVIEW_REQUIRED",
    manualReviewReason: "Unable to map Shippo verdicts to a credit-safe classification.",
  };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { isShippoConfigured } = await import("../src/lib/shippo");
  const { getStripe, isStripeConfigured } = await import("../src/lib/stripe");
  const {
    verifyShippoLabelRefundStatus,
    extractProvenNoShippoCharge,
  } = await import("../src/services/shipping/shippo-label-refund-status");

  if (!isShippoConfigured()) {
    console.error(JSON.stringify({ error: "SHIPPO_API_TOKEN is not set" }, null, 2));
    process.exit(1);
  }
  if (!isStripeConfigured()) {
    console.error(JSON.stringify({ error: "Stripe is not configured" }, null, 2));
    process.exit(1);
  }

  const stripe = getStripe();

  // Complete candidate set: any active financial label deduction OR paid labeled orders.
  const candidates = await prisma.order.findMany({
    where: {
      OR: [
        { shippingLabelCostReversedCents: { gt: 0 } },
        { shippingLabelCostReversalId: { not: null } },
        {
          AND: [
            { paymentStatus: "paid" },
            {
              OR: [
                { shippingLabelCostCents: { gt: 0 } },
                { shippoTransactionId: { not: null } },
                { liveShippingSessionId: { not: null } },
              ],
            },
          ],
        },
        // Exception rows that still hold a deduction (already covered by clawback > 0 above).
        { fulfillmentStatus: "exception", shippingLabelCostReversedCents: { gt: 0 } },
      ],
    },
    select: {
      id: true,
      sellerId: true,
      liveShippingSessionId: true,
      stripeTransferId: true,
      stripePaymentIntentId: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      shippingLabelCostReversalId: true,
      shippoTransactionId: true,
      labelUrl: true,
      trackingNumber: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      shippingStatus: true,
      seller: { select: { id: true, stripeAccountId: true, username: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  type AffectedRow = {
    orderId: string;
    sellerId: string;
    sellerUsername: string | null;
    sellerStripeAccountId: string | null;
    liveShippingSessionId: string | null;
    shippoTransactionIds: string[];
    shippoTransactionStatuses: string[];
    objectStates: string[];
    billingPaymentEvidence: Array<{
      shippoTransactionId: string;
      paymentsCount: number | null;
      provenNoShippoCharge: boolean;
    }>;
    quotedLabelCostCents: number;
    actualSuccessfulLabelCostCents: number;
    stripeTransferId: string | null;
    stripeReversalIds: string[];
    grossSellerClawbackCents: number;
    existingSellerCreditsCents: number;
    proposedSellerCreditCents: number;
    finalClassification: RepairClassification;
    manualReviewReason: string | null;
    failedShippoTransactionIds: string[];
    successfulShippoTransactionIds: string[];
    txEvidence: TxEvidence[];
    repairIdempotencyKey: string | null;
    safeToApply: boolean;
    blocker: string | null;
    evidenceSummary: string;
  };

  const affected: AffectedRow[] = [];
  const scannedButValid: string[] = [];
  let shippoCalls = 0;

  for (const order of candidates) {
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
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const txIdSet = new Set<string>();
    if (order.shippoTransactionId?.trim()) txIdSet.add(order.shippoTransactionId.trim());
    for (const p of packages) {
      if (p.shippoTransactionId?.trim()) txIdSet.add(p.shippoTransactionId.trim());
    }
    const txIds = [...txIdSet];

    const quotedFromPackages = packages.reduce((s, p) => s + Math.max(0, p.labelCostCents ?? 0), 0);
    const quotedLabelCostCents =
      quotedFromPackages > 0 ? quotedFromPackages : Math.max(0, order.shippingLabelCostCents ?? 0);

    const txEvidence: TxEvidence[] = [];
    for (const txId of txIds) {
      shippoCalls += 1;
      if (shippoCalls % 20 === 0) await sleep(150);
      const evidence = await verifyShippoLabelRefundStatus(txId);
      const raw = (evidence.rawTransaction ?? {}) as Record<string, unknown>;
      const objectState =
        typeof raw.object_state === "string" ? String(raw.object_state) : null;
      const billing = raw.billing;
      let paymentsCount: number | null = null;
      if (billing != null && typeof billing === "object" && Array.isArray((billing as { payments?: unknown }).payments)) {
        paymentsCount = (billing as { payments: unknown[] }).payments.length;
      }
      const pkgQuote =
        packages.find((p) => p.shippoTransactionId === txId)?.labelCostCents ?? null;
      const proven = extractProvenNoShippoCharge(raw, evidence.messages);
      txEvidence.push({
        shippoTransactionId: txId,
        status: evidence.transactionStatus,
        objectState,
        labelUrl: typeof raw.label_url === "string" ? raw.label_url : null,
        trackingNumber: typeof raw.tracking_number === "string" ? raw.tracking_number : null,
        billingPaymentsCount: paymentsCount,
        messages: evidence.messages,
        verdict: evidence.verdict,
        provenNoShippoCharge: proven,
        quotedLabelCostCents: pkgQuote,
        affirmativelyPurchased: evidence.purchaseProof.affirmativelyPurchased,
      });
    }

    const failedTxs = txEvidence.filter(
      (t) => t.verdict === "failed_purchase" || t.provenNoShippoCharge,
    );
    const successfulTxs = txEvidence.filter((t) => t.verdict === "chargeable");
    const actualSuccessfulLabelCostCents = successfulTxs.reduce((s, t) => {
      const q = t.quotedLabelCostCents ?? 0;
      return s + Math.max(0, q);
    }, 0);

    // Stripe reversals on the seller payout transfer.
    let stripeReversalIds: string[] = [];
    let grossFromStripe = 0;
    if (order.stripeTransferId?.trim()) {
      try {
        const reversals = await stripe.transfers.listReversals(order.stripeTransferId, {
          limit: 30,
        });
        const sorted = [...reversals.data].sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
        stripeReversalIds = sorted.map((r) => r.id);
        grossFromStripe = sorted.reduce((s, r) => s + (r.amount ?? 0), 0);
      } catch {
        // fall back to order field
      }
    }
    const grossSellerClawbackCents = Math.max(
      grossFromStripe,
      Math.max(0, order.shippingLabelCostReversedCents ?? 0),
    );

    // Existing restoring credits (metadata search — do not trust DB alone).
    let existingSellerCreditsCents = 0;
    const destination = order.seller.stripeAccountId?.trim() || null;
    if (destination) {
      try {
        const recent = await stripe.transfers.list({ destination, limit: 100 });
        const restoring = recent.data.filter((t) => {
          const md = t.metadata ?? {};
          return (
            md.orderId === order.id &&
            (md.reason === "failed_shippo_label_clawback_refund" ||
              md.reason === "replaced_label_refund_credit" ||
              md.repairClassification === "NEITHER_LABEL_CHARGED" ||
              md.repairClassification === "FAILED_LABEL_CLAWBACK_CREDIT_REQUIRED" ||
              String(md.repairIdempotencyKey ?? "").startsWith("failed_label_clawback_credit_"))
          );
        });
        existingSellerCreditsCents = restoring.reduce((s, t) => s + (t.amount ?? 0), 0);
      } catch {
        // ignore
      }
    }

    // Proposed credit = clawbacks attributable to failed purchases (not successful ones).
    let improperClawbackCents = 0;
    if (failedTxs.length > 0 && successfulTxs.length === 0) {
      // All attempts failed → entire clawback is improper (cap at quoted failed costs when known).
      const failedQuoted = failedTxs.reduce(
        (s, t) => s + Math.max(0, t.quotedLabelCostCents ?? 0),
        0,
      );
      improperClawbackCents =
        failedQuoted > 0
          ? Math.min(grossSellerClawbackCents, failedQuoted)
          : grossSellerClawbackCents;
    } else if (failedTxs.length > 0 && successfulTxs.length > 0) {
      const failedQuoted = failedTxs.reduce(
        (s, t) => s + Math.max(0, t.quotedLabelCostCents ?? 0),
        0,
      );
      // Partial: credit only the failed attempt quotes (or residual over successful charge).
      const residual = Math.max(0, grossSellerClawbackCents - actualSuccessfulLabelCostCents);
      improperClawbackCents =
        failedQuoted > 0 ? Math.min(residual, failedQuoted) : residual;
    }

    if (order.id === ORIGINAL_ORDER_ID) {
      improperClawbackCents = ORIGINAL_CREDIT_CENTS;
    }

    const proposedSellerCreditCents = Math.max(
      0,
      improperClawbackCents - existingSellerCreditsCents,
    );

    const hasImproperSignal =
      failedTxs.length > 0 &&
      grossSellerClawbackCents > 0 &&
      (proposedSellerCreditCents > 0 || existingSellerCreditsCents > 0);

    const hasPendingOrUnknown =
      txEvidence.some((t) => t.verdict === "refund_pending" || t.verdict === "unknown") &&
      grossSellerClawbackCents > 0;

    // Mixed history: failed txs exist alongside a successful charge — always surface for review
    // even when residual improper credit is currently $0 (prior limited scan flagged these).
    const hasMixedFailedHistory =
      failedTxs.length > 0 && successfulTxs.length > 0 && grossSellerClawbackCents > 0;

    if (!hasImproperSignal && !hasPendingOrUnknown && !hasMixedFailedHistory) {
      if (successfulTxs.length > 0 && grossSellerClawbackCents > 0) {
        scannedButValid.push(order.id);
      }
      continue;
    }

    let { classification, manualReviewReason } = classifyOrder({
      orderId: order.id,
      txEvidence,
      grossClawbackCents: grossSellerClawbackCents,
      existingCreditCents: existingSellerCreditsCents,
      proposedCreditCents:
        order.id === ORIGINAL_ORDER_ID ? ORIGINAL_CREDIT_CENTS : proposedSellerCreditCents,
    });

    // Mixed failed+success with $0 residual credit: not a repair credit row, but not silent.
    if (
      hasMixedFailedHistory &&
      proposedSellerCreditCents <= 0 &&
      order.id !== ORIGINAL_ORDER_ID
    ) {
      classification = "PARTIAL_FAILED_LABEL_CLAWBACK_CREDIT_REQUIRED";
      manualReviewReason =
        "Failed Shippo attempts exist alongside a successful charge; order clawback currently matches successful label cost only (proposed credit 0). Confirm no extra reversal was taken for failed attempts.";
    }

    const creditForKey =
      order.id === ORIGINAL_ORDER_ID ? ORIGINAL_CREDIT_CENTS : proposedSellerCreditCents;
    const repairIdempotencyKey =
      creditForKey > 0 ? buildRepairIdempotencyKey(order.id, creditForKey) : null;

    let blocker: string | null = null;
    let safeToApply = false;
    if (
      classification === "MANUAL_REVIEW_REQUIRED" ||
      classification === "REFUND_PENDING" ||
      classification === "VALID_SUCCESSFUL_LABEL_CHARGE"
    ) {
      blocker =
        classification === "VALID_SUCCESSFUL_LABEL_CHARGE"
          ? "No credit required — successful label charge."
          : manualReviewReason ?? classification;
      safeToApply = false;
    } else if (creditForKey <= 0) {
      blocker = manualReviewReason
        ? `No credit proposed — ${manualReviewReason}`
        : "No remaining credit required (already credited or zero exposure).";
      safeToApply = false;
    } else if (!destination) {
      blocker = "Seller has no Stripe Connect account.";
      safeToApply = false;
    } else if (failedTxs.length === 0) {
      blocker = "No failed Shippo purchase evidence.";
      safeToApply = false;
    } else if (stripeReversalIds.length === 0 && grossSellerClawbackCents <= 0) {
      blocker = "No Stripe reversal evidence for clawback.";
      safeToApply = false;
    } else {
      safeToApply = false; // never safe until balance + human approval + prevention deploy
      blocker =
        "Pending prevention deploy, finance backfill, balance preflight, and human approval.";
    }

    const failedShippoTransactionIds = failedTxs.map((t) => t.shippoTransactionId);
    const evidenceSummary = [
      `failed=${failedShippoTransactionIds.length}`,
      `success=${successfulTxs.length}`,
      `clawback=${grossSellerClawbackCents}¢`,
      `proposedCredit=${creditForKey}¢`,
      `class=${classification}`,
    ].join("; ");

    affected.push({
      orderId: order.id,
      sellerId: order.sellerId,
      sellerUsername: order.seller.username ?? null,
      sellerStripeAccountId: destination,
      liveShippingSessionId: order.liveShippingSessionId,
      shippoTransactionIds: txIds,
      shippoTransactionStatuses: txEvidence.map((t) => t.status ?? "null"),
      objectStates: txEvidence.map((t) => t.objectState ?? "null"),
      billingPaymentEvidence: txEvidence.map((t) => ({
        shippoTransactionId: t.shippoTransactionId,
        paymentsCount: t.billingPaymentsCount,
        provenNoShippoCharge: t.provenNoShippoCharge,
      })),
      quotedLabelCostCents,
      actualSuccessfulLabelCostCents,
      stripeTransferId: order.stripeTransferId,
      stripeReversalIds,
      grossSellerClawbackCents,
      existingSellerCreditsCents,
      proposedSellerCreditCents: creditForKey,
      finalClassification: classification,
      manualReviewReason,
      failedShippoTransactionIds,
      successfulShippoTransactionIds: successfulTxs.map((t) => t.shippoTransactionId),
      txEvidence,
      repairIdempotencyKey,
      safeToApply,
      blocker,
      evidenceSummary,
    });
  }

  // Platform balance (available only).
  let platformAvailableUsdCents: number | null = null;
  let platformPendingUsdCents: number | null = null;
  try {
    const balance = await stripe.balance.retrieve();
    platformAvailableUsdCents = (balance.available ?? [])
      .filter((b) => b.currency === "usd")
      .reduce((s, b) => s + (b.amount ?? 0), 0);
    platformPendingUsdCents = (balance.pending ?? [])
      .filter((b) => b.currency === "usd")
      .reduce((s, b) => s + (b.amount ?? 0), 0);
  } catch {
    // leave null
  }

  const creditRequiredRows = affected.filter(
    (a) =>
      a.proposedSellerCreditCents > 0 &&
      (a.finalClassification === "FAILED_LABEL_CLAWBACK_CREDIT_REQUIRED" ||
        a.finalClassification === "PARTIAL_FAILED_LABEL_CLAWBACK_CREDIT_REQUIRED" ||
        a.finalClassification === "NEITHER_LABEL_CHARGED"),
  );

  const mixedZeroCreditRows = affected.filter(
    (a) =>
      a.proposedSellerCreditCents <= 0 &&
      a.failedShippoTransactionIds.length > 0 &&
      a.successfulShippoTransactionIds.length > 0,
  );

  const bySellerMap = new Map<
    string,
    {
      sellerId: string;
      sellerUsername: string | null;
      sellerStripeAccountId: string | null;
      orderIds: string[];
      improperClawbackCents: number;
      existingCreditsCents: number;
      remainingCreditCents: number;
    }
  >();
  for (const row of creditRequiredRows) {
    const cur = bySellerMap.get(row.sellerId) ?? {
      sellerId: row.sellerId,
      sellerUsername: row.sellerUsername,
      sellerStripeAccountId: row.sellerStripeAccountId,
      orderIds: [] as string[],
      improperClawbackCents: 0,
      existingCreditsCents: 0,
      remainingCreditCents: 0,
    };
    cur.orderIds.push(row.orderId);
    cur.improperClawbackCents += row.grossSellerClawbackCents;
    // For partial cases, improper is the proposed+existing for failed portion.
    if (row.finalClassification === "PARTIAL_FAILED_LABEL_CLAWBACK_CREDIT_REQUIRED") {
      // Adjust: count proposed+existing as improper exposure for failed portion.
      cur.improperClawbackCents =
        cur.improperClawbackCents -
        row.grossSellerClawbackCents +
        row.proposedSellerCreditCents +
        row.existingSellerCreditsCents;
    }
    cur.existingCreditsCents += row.existingSellerCreditsCents;
    cur.remainingCreditCents += row.proposedSellerCreditCents;
    bySellerMap.set(row.sellerId, cur);
  }

  // Recompute seller improper totals more carefully: sum proposed+existing per credit row.
  for (const [sellerId, cur] of bySellerMap) {
    const rows = creditRequiredRows.filter((r) => r.sellerId === sellerId);
    cur.improperClawbackCents = rows.reduce(
      (s, r) => s + r.proposedSellerCreditCents + r.existingSellerCreditsCents,
      0,
    );
    cur.existingCreditsCents = rows.reduce((s, r) => s + r.existingSellerCreditsCents, 0);
    cur.remainingCreditCents = rows.reduce((s, r) => s + r.proposedSellerCreditCents, 0);
    bySellerMap.set(sellerId, cur);
  }

  const sellerTotals = [...bySellerMap.values()].sort(
    (a, b) => b.remainingCreditCents - a.remainingCreditCents,
  );

  const totalImproper = creditRequiredRows.reduce(
    (s, r) => s + r.proposedSellerCreditCents + r.existingSellerCreditsCents,
    0,
  );
  const totalExistingCredits = creditRequiredRows.reduce(
    (s, r) => s + r.existingSellerCreditsCents,
    0,
  );
  const totalRemainingCredits = creditRequiredRows.reduce(
    (s, r) => s + r.proposedSellerCreditCents,
    0,
  );
  const largestSeller = sellerTotals[0] ?? null;
  const manualReviewCount = affected.filter(
    (a) =>
      a.finalClassification === "MANUAL_REVIEW_REQUIRED" ||
      a.finalClassification === "REFUND_PENDING" ||
      (a.proposedSellerCreditCents <= 0 &&
        a.failedShippoTransactionIds.length > 0 &&
        Boolean(a.manualReviewReason)),
  ).length;

  const manifest = creditRequiredRows.map((r) => ({
    orderId: r.orderId,
    sellerId: r.sellerId,
    sellerStripeAccountId: r.sellerStripeAccountId,
    proposedCreditCents: r.proposedSellerCreditCents,
    failedShippoTransactionIds: r.failedShippoTransactionIds,
    originalStripeReversalIds: r.stripeReversalIds,
    repairClassification: r.finalClassification,
    repairIdempotencyKey: r.repairIdempotencyKey,
    evidenceSummary: r.evidenceSummary,
    safeToApply: false,
    blocker: r.blocker,
  }));

  const manifestBody = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      mode: "READ_ONLY_REPAIR_MANIFEST",
      note: "No secrets. safeToApply is false until prevention deploy + balance + human approval.",
      rows: manifest,
    },
    null,
    2,
  );
  const manifestHash = createHash("sha256").update(manifestBody).digest("hex");

  const exposure = {
    totalAffectedOrders: creditRequiredRows.length,
    totalAffectedSellers: sellerTotals.length,
    totalImproperSellerClawbacksCents: totalImproper,
    totalExistingRestoringCreditsCents: totalExistingCredits,
    totalRemainingCreditsRequiredCents: totalRemainingCredits,
    largestSingleSellerExposureCents: largestSeller?.remainingCreditCents ?? 0,
    largestSingleSellerId: largestSeller?.sellerId ?? null,
    totalRequiredStripeAvailableBalanceCents: totalRemainingCredits,
    countRequiringManualReview: manualReviewCount,
    platformAvailableUsdCents,
    platformPendingUsdCents,
    pendingDoesNotCountAsAvailable: true,
    balanceSufficientForAllRepairs:
      platformAvailableUsdCents != null &&
      platformAvailableUsdCents >= totalRemainingCredits,
  };

  const report = {
    mode: "READ_ONLY_COMPLETE_EXPOSURE_SCAN",
    generatedAt: new Date().toISOString(),
    candidateOrders: candidates.length,
    shippoLookups: shippoCalls,
    scannedValidSuccessfulLabelCharges: scannedButValid.length,
    exposure,
    sellerTotals,
    affectedOrders: affected,
    creditRequiredOrders: creditRequiredRows,
    mixedFailedHistoryZeroCreditOrders: mixedZeroCreditRows,
    manualReviewOrders: affected.filter(
      (a) =>
        a.finalClassification === "MANUAL_REVIEW_REQUIRED" ||
        a.finalClassification === "REFUND_PENDING" ||
        (a.proposedSellerCreditCents <= 0 && Boolean(a.manualReviewReason)),
    ),
    originalOrderLockedProposal: {
      orderId: ORIGINAL_ORDER_ID,
      classification: ORIGINAL_CLASSIFICATION,
      creditCents: ORIGINAL_CREDIT_CENTS,
      idempotencyKey: ORIGINAL_IDEMPOTENCY_KEY,
      applied: false,
    },
    manifestHash,
    note: "No mutations. Do not --apply until prevention is deployed and humans approve.",
  };

  fs.mkdirSync(path.dirname(OUT_BASE), { recursive: true });
  const reportPath = `${OUT_BASE}.report.json`;
  const manifestJsonPath = `${OUT_BASE}.manifest.json`;
  const manifestCsvPath = `${OUT_BASE}.manifest.csv`;
  const hashPath = `${OUT_BASE}.manifest.sha256`;

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(manifestJsonPath, manifestBody, "utf8");
  fs.writeFileSync(hashPath, `${manifestHash}\n`, "utf8");

  const csvHeader = [
    "orderId",
    "sellerId",
    "sellerStripeAccountId",
    "proposedCreditCents",
    "failedShippoTransactionIds",
    "originalStripeReversalIds",
    "repairClassification",
    "repairIdempotencyKey",
    "evidenceSummary",
    "safeToApply",
    "blocker",
  ];
  const csvRows = manifest.map((m) =>
    [
      m.orderId,
      m.sellerId,
      m.sellerStripeAccountId ?? "",
      String(m.proposedCreditCents),
      (m.failedShippoTransactionIds ?? []).join("|"),
      (m.originalStripeReversalIds ?? []).join("|"),
      m.repairClassification,
      m.repairIdempotencyKey ?? "",
      JSON.stringify(m.evidenceSummary),
      String(m.safeToApply),
      JSON.stringify(m.blocker ?? ""),
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(","),
  );
  fs.writeFileSync(manifestCsvPath, [csvHeader.join(","), ...csvRows].join("\n"), "utf8");

  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        reportPath,
        manifestJsonPath,
        manifestCsvPath,
        manifestHash,
        exposure,
        sellerTotals,
        creditRequiredOrderIds: creditRequiredRows.map((r) => r.orderId),
        mixedZeroCreditOrderIds: mixedZeroCreditRows.map((r) => r.orderId),
        manualReviewOrderIds: report.manualReviewOrders.map((o) => o.orderId),
        originalOrderLockedProposal: report.originalOrderLockedProposal,
        candidateOrders: candidates.length,
        affectedOrderCount: affected.length,
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
