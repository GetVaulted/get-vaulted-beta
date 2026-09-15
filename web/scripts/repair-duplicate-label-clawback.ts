/**
 * Idempotent repair for confirmed duplicate seller label clawbacks from regeneration.
 *
 * Default: dry-run (prints evidence, makes no financial changes).
 * Apply:   npx tsx scripts/repair-duplicate-label-clawback.ts --apply
 *
 * Target order (confirmed): cmrr427ae000909kyjrurbm1r
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
config({ path: path.join(webRoot, ".env"), quiet: true });
config({ path: path.join(webRoot, ".env.local"), override: true, quiet: true });

const ORDER_ID = "cmrr427ae000909kyjrurbm1r";
const APPLY = process.argv.includes("--apply");

type ProposedResult =
  | "CREDIT_REQUIRED_1751"
  | "BOTH_LABELS_CHARGED"
  | "ONE_LABEL_CHARGED"
  | "NEITHER_LABEL_CHARGED"
  | "PENDING_SHIPPO_REFUND"
  | "MANUAL_REVIEW_REQUIRED";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getStripe, isStripeConfigured } = await import("../src/lib/stripe");
  const { isShippoConfigured } = await import("../src/lib/shippo");
  const { verifyShippoLabelRefundStatus } = await import(
    "../src/services/shipping/shippo-label-refund-status"
  );
  const { recalculateOrderLabelFinanceSummary } = await import(
    "../src/services/shipping/label-finance"
  );
  const { classifyDualLabelBillingEvidence } = await import(
    "../src/services/shipping/label-charge-evidence"
  );
  const {
    planNeitherLabelChargedRepair,
    applyNeitherLabelChargedRepair,
    NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS,
    NEITHER_LABEL_CHARGED_PER_TX_CENTS,
  } = await import("../src/services/shipping/repair-neither-label-charged");

  const order = await prisma.order.findUnique({
    where: { id: ORDER_ID },
    select: {
      id: true,
      sellerId: true,
      liveShippingSessionId: true,
      stripeTransferId: true,
      stripePaymentIntentId: true,
      shippingLabelCostCents: true,
      shippingLabelCostReversedCents: true,
      shippingLabelCostReversalId: true,
      shippingLabelCostChargedShippoTransactionId: true,
      shippoTransactionId: true,
      seller: { select: { stripeAccountId: true } },
    },
  });
  if (!order) {
    console.error(JSON.stringify({ error: "ORDER_NOT_FOUND", orderId: ORDER_ID }, null, 2));
    process.exit(1);
  }

  let existingLabelFinances: Array<Record<string, unknown>> = [];
  let labelFinanceTableReady = true;
  try {
    existingLabelFinances = await prisma.shipmentLabelFinance.findMany({
      where: { orderId: ORDER_ID },
      orderBy: { createdAt: "asc" },
    });
  } catch (e) {
    labelFinanceTableReady = false;
    console.error(
      JSON.stringify({
        warning:
          "ShipmentLabelFinance table not available yet — dry-run continues with packages/Shippo/Stripe only",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }

  const packages = await prisma.shipmentPackage.findMany({
    where: {
      OR: [
        { orderId: ORDER_ID },
        ...(order.liveShippingSessionId
          ? [{ liveShippingSessionId: order.liveShippingSessionId }]
          : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const shippoConfigured = isShippoConfigured();
  const shippoEvidence = [];
  for (const pkg of packages) {
    const txId = pkg.shippoTransactionId?.trim();
    if (!txId) continue;
    if (!shippoConfigured) {
      shippoEvidence.push({
        packageId: pkg.id,
        packageIndex: pkg.packageIndex,
        labelCostCents: pkg.labelCostCents,
        createdAt: pkg.createdAt.toISOString(),
        shippoTransactionId: txId,
        transactionStatus: null,
        refundRequestStatus: null,
        refundAmount: null,
        refundCreationDate: null,
        remainsChargeable: null,
        refundStatuses: [],
        refunds: [],
        lookupError: "SHIPPO_API_TOKEN is not set",
        verdict: "unknown" as const,
        rawStatusValues: { transactionStatus: null, refundStatuses: [] as string[] },
      });
      continue;
    }
    const evidence = await verifyShippoLabelRefundStatus(txId);
    const primaryRefund = evidence.refunds[0] ?? null;
    const raw = evidence.rawTransaction ?? {};
    const trackingStatusRaw = raw.tracking_status;
    const trackingStatus =
      typeof trackingStatusRaw === "string"
        ? trackingStatusRaw
        : trackingStatusRaw && typeof trackingStatusRaw === "object" && "status" in trackingStatusRaw
          ? String((trackingStatusRaw as { status?: unknown }).status ?? "")
          : null;
    shippoEvidence.push({
      packageId: pkg.id,
      packageIndex: pkg.packageIndex,
      labelCostCents: pkg.labelCostCents,
      createdAt: pkg.createdAt.toISOString(),
      shippoTransactionId: evidence.shippoTransactionId,
      transactionStatus: evidence.transactionStatus,
      labelUrl: typeof raw.label_url === "string" ? raw.label_url : null,
      trackingNumber: typeof raw.tracking_number === "string" ? raw.tracking_number : null,
      trackingStatus: trackingStatus || null,
      messages: evidence.messages,
      purchaseProof: evidence.purchaseProof,
      objectCreated: typeof raw.object_created === "string" ? raw.object_created : null,
      objectUpdated: typeof raw.object_updated === "string" ? raw.object_updated : null,
      testMode: typeof raw.test === "boolean" ? raw.test : null,
      rate: raw.rate ?? null,
      labelFileType: raw.label_file_type ?? null,
      commercialInvoiceUrl: raw.commercial_invoice_url ?? null,
      metadata: raw.metadata ?? null,
      refundRequestStatus: primaryRefund?.status ?? (evidence.refundStatuses[0] ?? null),
      refundAmount: primaryRefund?.amount ?? null,
      refundCreationDate: primaryRefund?.createdAt ?? null,
      remainsChargeable: evidence.remainsChargeable,
      refundStatuses: evidence.refundStatuses,
      refunds: evidence.refunds,
      lookupError: evidence.lookupError,
      verdict: evidence.verdict,
      shippoClassification: evidence.shippoClassification,
      rawStatusValues: evidence.rawStatusValues,
    });
  }

  const stripeConfigured = isStripeConfigured();
  let stripeTransfer: Record<string, unknown> | null = null;
  const stripeReversals: Array<Record<string, unknown>> = [];
  let platformAvailableUsdCents: number | null = null;
  let stripeLookupError: string | null = null;

  if (stripeConfigured && order.stripeTransferId) {
    const stripe = getStripe();
    try {
      const transfer = await stripe.transfers.retrieve(order.stripeTransferId);
      stripeTransfer = {
        id: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        destination:
          typeof transfer.destination === "string"
            ? transfer.destination
            : (transfer.destination as { id?: string } | null)?.id ?? null,
        reversed: transfer.reversed,
        amount_reversed: transfer.amount_reversed,
        created: transfer.created,
      };
      const reversals = await stripe.transfers.listReversals(order.stripeTransferId, { limit: 20 });
      for (const rev of reversals.data) {
        stripeReversals.push({
          id: rev.id,
          amount: rev.amount,
          currency: rev.currency,
          created: rev.created,
          createdIso: new Date(rev.created * 1000).toISOString(),
          description: rev.description ?? null,
          // TransferReversal has no separate "refunded" flag; balance impact is the reversal itself.
          object: rev.object,
          balance_transaction:
            typeof rev.balance_transaction === "string"
              ? rev.balance_transaction
              : (rev.balance_transaction as { id?: string } | null)?.id ?? null,
        });
      }
      const balance = await stripe.balance.retrieve();
      platformAvailableUsdCents = (balance.available ?? [])
        .filter((b) => b.currency === "usd")
        .reduce((sum, b) => sum + (b.amount ?? 0), 0);
    } catch (e) {
      stripeLookupError = e instanceof Error ? e.message : String(e);
    }
  } else if (!stripeConfigured) {
    stripeLookupError = "Stripe is not configured";
  } else {
    stripeLookupError = "Order has no stripeTransferId";
  }

  const sortedPkgs = [...packages].filter((p) => p.shippoTransactionId && (p.labelCostCents ?? 0) > 0);
  const first = sortedPkgs[0] ?? null;
  const second = sortedPkgs[1] ?? null;
  const firstEvidence = shippoEvidence.find((e) => e.shippoTransactionId === first?.shippoTransactionId);
  const secondEvidence = shippoEvidence.find((e) => e.shippoTransactionId === second?.shippoTransactionId);
  const firstVerdict = (firstEvidence?.verdict ?? "unknown") as
    | "refunded"
    | "refund_pending"
    | "chargeable"
    | "failed_purchase"
    | "unknown";
  const secondVerdict = (secondEvidence?.verdict ?? "unknown") as typeof firstVerdict;
  const anyLookupError = shippoEvidence.some((e) => e.lookupError) || Boolean(stripeLookupError);

  const billing = classifyDualLabelBillingEvidence({
    firstVerdict,
    secondVerdict,
    labelCostCentsEach: NEITHER_LABEL_CHARGED_PER_TX_CENTS,
  });
  let proposedResult: ProposedResult = anyLookupError
    ? "MANUAL_REVIEW_REQUIRED"
    : (billing.classification as ProposedResult);

  // Confirmed evidence for this order: both Shippo txs ERROR/INVALID with empty billing.payments.
  if (
    firstVerdict === "failed_purchase" &&
    secondVerdict === "failed_purchase" &&
    stripeReversals.length >= 2
  ) {
    proposedResult = "NEITHER_LABEL_CHARGED";
  }

  const neitherPlan = await planNeitherLabelChargedRepair(ORDER_ID);
  const creditCents = NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS;
  const creditIdempotencyKey = neitherPlan.idempotencyKey;

  const firstCost = first?.labelCostCents ?? NEITHER_LABEL_CHARGED_PER_TX_CENTS;
  const secondCost = second?.labelCostCents ?? NEITHER_LABEL_CHARGED_PER_TX_CENTS;
  const buyerShippingCents = 399;
  const grossClawbacks = NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS;
  const existingCredits = existingLabelFinances.reduce(
    (s, f) => s + Math.max(0, Number(f.sellerCreditCents ?? 0)),
    0,
  );
  const expectedSellerCredit =
    proposedResult === "NEITHER_LABEL_CHARGED"
      ? NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS
      : billing.financials.expectedSellerCreditCents;
  const expectedNetSellerDeduction =
    proposedResult === "NEITHER_LABEL_CHARGED"
      ? 0
      : billing.financials.expectedNetSellerDeductionCents;
  const expectedChargeableLabelCost =
    proposedResult === "NEITHER_LABEL_CHARGED"
      ? 0
      : billing.financials.expectedChargeableLabelCostCents;
  const remainingReconciliationDiff =
    proposedResult === "NEITHER_LABEL_CHARGED"
      ? 0
      : billing.financials.remainingReconciliationDiffCents;

  const platformPendingUsdCents = neitherPlan.platformPendingUsdCents;
  if (platformAvailableUsdCents == null) {
    platformAvailableUsdCents = neitherPlan.platformAvailableUsdCents;
  }

  const creditWouldSucceedToday = neitherPlan.balanceSufficient;
  const existingOffsetTransfers = neitherPlan.existingRestoringTransferIds.map((id) => ({
    id,
    amount: NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS,
  }));

  const proposedLedgerRows =
    proposedResult === "NEITHER_LABEL_CHARGED"
      ? (neitherPlan.shippoTransactionIds.length >= 2
          ? neitherPlan.shippoTransactionIds
          : [first?.shippoTransactionId, second?.shippoTransactionId].filter(Boolean)
        ).map((txId, i) => ({
          shippoTransactionId: txId,
          purpose: i === 0 ? "initial" : "replacement",
          status: "failed_purchase",
          labelCostCents: 0,
          quotedLabelCostCents: NEITHER_LABEL_CHARGED_PER_TX_CENTS,
          sellerClawbackCents: NEITHER_LABEL_CHARGED_PER_TX_CENTS,
          sellerCreditCentsAfterRepair: NEITHER_LABEL_CHARGED_PER_TX_CENTS,
          netSellerDeductionAfterRepair: 0,
          sellerClawbackReversalId: neitherPlan.stripeReversalIds[i] ?? stripeReversals[i]?.id ?? null,
          repairCreditIdempotencyKey: creditIdempotencyKey,
        }))
      : [];

  const report = {
    mode: APPLY ? "APPLY" : "DRY_RUN",
    orderId: ORDER_ID,
    liveShippingSessionId: order.liveShippingSessionId,
    credentials: {
      shippoConfigured,
      stripeConfigured,
    },
    orderSummary: {
      shippingLabelCostCents: order.shippingLabelCostCents,
      shippingLabelCostReversedCents: order.shippingLabelCostReversedCents,
      shippingLabelCostReversalId: order.shippingLabelCostReversalId,
      chargedShippoTransactionId: order.shippingLabelCostChargedShippoTransactionId,
      currentShippoTransactionId: order.shippoTransactionId,
      stripeTransferId: order.stripeTransferId,
      sellerStripeAccountId: order.seller.stripeAccountId,
    },
    packages: packages.map((p) => ({
      id: p.id,
      packageIndex: p.packageIndex,
      shippoTransactionId: p.shippoTransactionId,
      shippoShipmentId: p.shippoShipmentId,
      labelCostCents: p.labelCostCents,
      createdAt: p.createdAt.toISOString(),
    })),
    shippoEvidence,
    stripeEvidence: {
      originalSellerTransferId: order.stripeTransferId,
      transfer: stripeTransfer,
      reversals: stripeReversals,
      reversalCount: stripeReversals.length,
      totalReversedCents: stripeReversals.reduce((s, r) => s + Number(r.amount ?? 0), 0),
      anyReversalOffsetDetected: existingOffsetTransfers.length > 0,
      existingOffsetTransfers,
      destinationSellerAccount: order.seller.stripeAccountId,
      proposedSellerCreditDestination: neitherPlan.destinationAccountId,
      destinationAccountValid: neitherPlan.destinationAccountValid,
      proposedCreditCents: creditCents,
      proposedIdempotencyKey: creditIdempotencyKey,
      proposedIdempotencyStrategy:
        "One repair-level Stripe transfer idempotency key for the full 3502¢ correction; allocate 1751¢ credit per failed finance row after Stripe confirms the transfer.",
      platformAvailableUsdCents,
      platformPendingUsdCents,
      creditOf3502WouldSucceedToday: creditWouldSucceedToday,
      pendingBalanceDoesNotCountAsAvailable: true,
      lookupError: stripeLookupError,
    },
    neitherLabelChargedRepairPlan: neitherPlan,
    proposedFinancialResult: {
      buyerShippingCollectedCents: buyerShippingCents,
      firstLabelCostCents: firstCost,
      secondLabelCostCents: secondCost,
      grossSellerClawbacksCents: grossClawbacks,
      existingSellerCreditsCents: existingCredits,
      expectedSellerCreditCents: expectedSellerCredit,
      expectedNetSellerDeductionCents: expectedNetSellerDeduction,
      expectedChargeableLabelCostCents: expectedChargeableLabelCost,
      remainingReconciliationDiffCents: remainingReconciliationDiff,
      orderSummariesAfterRepair: {
        shippingLabelCostCents: 0,
        shippingLabelCostReversedCents: 0,
      },
    },
    proposedShipmentLabelFinanceRows: proposedLedgerRows,
    operationalBlockers: {
      databaseMigrationDeployed: labelFinanceTableReady,
      applicationCodeDeployed: "unknown_not_checked_in_dry_run",
      shipmentLabelFinanceRowsExist: existingLabelFinances.length > 0,
      platformBalanceSufficientFor3502Credit: creditWouldSucceedToday,
      destinationAccountValid: neitherPlan.destinationAccountValid,
      safeToRepairNow: false,
      conditionBeforeApply:
        proposedResult === "MANUAL_REVIEW_REQUIRED"
          ? "Prove whether Shippo billed each ERROR transaction (billing/invoice), then re-classify; do not --apply on unknown"
          : proposedResult === "PENDING_SHIPPO_REFUND"
            ? "Wait until Shippo refund reaches SUCCESS or ERROR, then re-run dry-run"
            : proposedResult === "NEITHER_LABEL_CHARGED"
              ? !creditWouldSucceedToday
                ? "Deploy migration + app, fund platform available balance (>= 3502¢), human-approve, then --apply"
                : "Deploy migration + app, backfill finance rows, human-approve 3502¢ credit, then --apply"
              : "Deploy migration + app, backfill finance rows, human-approve, then --apply",
    },
    existingLabelFinances,
    labelFinanceTableReady,
    firstLabelVerdict: firstVerdict,
    secondLabelVerdict: secondEvidence?.verdict ?? null,
    proposedResult,
    plannedActions:
      proposedResult === "NEITHER_LABEL_CHARGED"
        ? [
            "Create/update two ShipmentLabelFinance rows as failed_purchase (quoted 1751, chargeable 0)",
            "Issue one Stripe Connect transfer of 3502¢ with repair idempotency key",
            "Allocate sellerCreditCents=1751 per failed row after Stripe confirms",
            "Set Order.shippingLabelCostCents=0 and shippingLabelCostReversedCents=0",
          ]
        : proposedResult === "ONE_LABEL_CHARGED" || proposedResult === "CREDIT_REQUIRED_1751"
          ? [
              "Credit seller for the non-chargeable/refunded attempt (1751¢)",
              "Keep one clawback for the affirmatively purchased label",
            ]
          : proposedResult === "BOTH_LABELS_CHARGED"
            ? ["Preserve 3502¢ net deduction — two proven Shippo charges"]
            : proposedResult === "PENDING_SHIPPO_REFUND"
              ? ["Make no financial change", "Wait for Shippo refund finalization"]
              : [
                  "Make no financial change",
                  "Manual review — ERROR transactions without billing proof are not chargeable",
                ],
    creditIdempotencyKey,
    note: "NEITHER_LABEL_CHARGED credits the full erroneous clawback (3502¢). Do not use a 1751¢ proposed credit for this classification.",
  };

  console.log(JSON.stringify(report, null, 2));

  if (!APPLY) {
    console.error("\nDry-run only. Re-run with --apply to mutate (after migration is deployed).");
    return;
  }

  if (!labelFinanceTableReady) {
    console.error("Cannot --apply: ShipmentLabelFinance table does not exist. Deploy migration first.");
    process.exit(1);
  }

  if (proposedResult !== "NEITHER_LABEL_CHARGED") {
    console.error(`Cannot --apply with proposedResult=${proposedResult}; this script applies NEITHER_LABEL_CHARGED only.`);
    process.exit(1);
  }

  const applied = await applyNeitherLabelChargedRepair(ORDER_ID);
  console.error(JSON.stringify({ appliedResult: applied, proposedResult }, null, 2));
  if (!applied.ok) process.exit(1);

  const summary = await recalculateOrderLabelFinanceSummary(ORDER_ID);
  console.error(JSON.stringify({ appliedSummary: summary, proposedResult }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
