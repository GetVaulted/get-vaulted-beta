import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import {
  buildFailedLabelClawbackRepairIdempotencyKey,
  recalculateOrderLabelFinanceSummary,
} from "@/services/shipping/label-finance";

export const NEITHER_LABEL_CHARGED_ORDER_ID = "cmrr427ae000909kyjrurbm1r";
export const NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS = 3502;
export const NEITHER_LABEL_CHARGED_PER_TX_CENTS = 1751;

/** Confirmed failed Shippo txs for the NEITHER_LABEL_CHARGED repair order. */
export const NEITHER_LABEL_CHARGED_KNOWN_TX_IDS = [
  "2fe5616d2e3748ef9569f193e432bf62",
  "edfcdb0bf1f14935b822c58599c46112",
] as const;

export type NeitherLabelChargedRepairPlan = {
  orderId: string;
  classification: "NEITHER_LABEL_CHARGED";
  proposedCreditCents: number;
  idempotencyKey: string;
  destinationAccountId: string | null;
  destinationAccountValid: boolean | null;
  shippoTransactionIds: string[];
  stripeReversalIds: string[];
  liveShippingSessionId: string | null;
  platformAvailableUsdCents: number | null;
  platformPendingUsdCents: number | null;
  balanceSufficient: boolean;
  existingRestoringTransferIds: string[];
  alreadyFullyCredited: boolean;
  remainingCreditCents: number;
  expectedOrderSummariesAfterRepair: {
    shippingLabelCostCents: 0;
    shippingLabelCostReversedCents: 0;
  };
};

function repairIdempotencyKey(orderId: string): string {
  return buildFailedLabelClawbackRepairIdempotencyKey(orderId, NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS);
}

/** Search Stripe for an existing restoring transfer for this repair (do not trust DB alone). */
export async function findExistingFailedLabelRepairTransfer(args: {
  destinationAccountId: string;
  orderId: string;
  idempotencyKey: string;
}): Promise<Array<{ id: string; amount: number; metadata: Record<string, string> }>> {
  if (!isStripeConfigured()) return [];
  const stripe = getStripe();
  const recent = await stripe.transfers.list({
    destination: args.destinationAccountId,
    limit: 100,
  });
  return recent.data
    .filter((t) => {
      const md = t.metadata ?? {};
      return (
        md.orderId === args.orderId &&
        (md.reason === "failed_shippo_label_clawback_refund" ||
          md.repairClassification === "NEITHER_LABEL_CHARGED" ||
          md.repairIdempotencyKey === args.idempotencyKey)
      );
    })
    .map((t) => ({
      id: t.id,
      amount: t.amount,
      metadata: Object.fromEntries(Object.entries(t.metadata ?? {}).map(([k, v]) => [k, String(v)])),
    }));
}

export async function planNeitherLabelChargedRepair(orderId: string): Promise<NeitherLabelChargedRepairPlan> {
  // Avoid including labelFinances in the Order select — table may not exist pre-migration.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      liveShippingSessionId: true,
      stripeTransferId: true,
      seller: { select: { stripeAccountId: true } },
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");

  let finances: Array<{
    shippoTransactionId: string;
    sellerClawbackReversalId: string | null;
    sellerCreditCents: number;
    sellerCreditTransferId: string | null;
  }> = [];
  try {
    finances = await prisma.shipmentLabelFinance.findMany({
      where: { orderId },
      select: {
        shippoTransactionId: true,
        sellerClawbackReversalId: true,
        sellerCreditCents: true,
        sellerCreditTransferId: true,
      },
      orderBy: { createdAt: "asc" },
    });
  } catch {
    finances = [];
  }

  const idempotencyKey = repairIdempotencyKey(orderId);
  const destination = order.seller.stripeAccountId?.trim() || null;
  let platformAvailableUsdCents: number | null = null;
  let platformPendingUsdCents: number | null = null;
  let existingRestoringTransferIds: string[] = [];
  let destinationAccountValid: boolean | null = null;

  if (isStripeConfigured() && destination) {
    const stripe = getStripe();
    const balance = await stripe.balance.retrieve();
    platformAvailableUsdCents = (balance.available ?? [])
      .filter((b) => b.currency === "usd")
      .reduce((sum, b) => sum + (b.amount ?? 0), 0);
    platformPendingUsdCents = (balance.pending ?? [])
      .filter((b) => b.currency === "usd")
      .reduce((sum, b) => sum + (b.amount ?? 0), 0);
    try {
      const acct = await stripe.accounts.retrieve(destination);
      destinationAccountValid = !acct.deleted && Boolean(acct.id);
    } catch {
      destinationAccountValid = false;
    }
    const existing = await findExistingFailedLabelRepairTransfer({
      destinationAccountId: destination,
      orderId,
      idempotencyKey,
    });
    existingRestoringTransferIds = existing.map((t) => t.id);
  }

  let shippoTransactionIds =
    finances.length > 0
      ? finances.map((f) => f.shippoTransactionId)
      : [...NEITHER_LABEL_CHARGED_KNOWN_TX_IDS];
  // Prefer live package tx ids when finance rows are absent (pre-migration dry-run).
  if (finances.length === 0) {
    try {
      const packages = await prisma.shipmentPackage.findMany({
        where: {
          OR: [
            { orderId },
            ...(order.liveShippingSessionId
              ? [{ liveShippingSessionId: order.liveShippingSessionId }]
              : []),
          ],
        },
        select: { shippoTransactionId: true },
        orderBy: { createdAt: "asc" },
      });
      const fromPkgs = packages
        .map((p) => p.shippoTransactionId?.trim())
        .filter((id): id is string => Boolean(id));
      if (fromPkgs.length >= 2) shippoTransactionIds = fromPkgs.slice(0, 2);
    } catch {
      // keep known ids
    }
  }

  let stripeReversalIds = finances
    .map((f) => f.sellerClawbackReversalId)
    .filter((id): id is string => Boolean(id));
  if (stripeReversalIds.length < 2 && order.stripeTransferId && isStripeConfigured()) {
    try {
      const stripe = getStripe();
      const reversals = await stripe.transfers.listReversals(order.stripeTransferId, { limit: 20 });
      // Oldest-first so index 0 aligns with the initial failed purchase package.
      stripeReversalIds = reversals.data
        .filter((r) => r.amount === NEITHER_LABEL_CHARGED_PER_TX_CENTS)
        .sort((a, b) => (a.created ?? 0) - (b.created ?? 0))
        .slice(0, 2)
        .map((r) => r.id);
    } catch {
      // dry-run can proceed without reversal ids
    }
  }

  const creditedFromDb = finances.reduce((s, f) => s + Math.max(0, f.sellerCreditCents), 0);
  const creditedFromStripe = existingRestoringTransferIds.length > 0
    ? NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS
    : 0;
  const credited = Math.max(creditedFromDb, creditedFromStripe);

  const alreadyFullyCredited =
    existingRestoringTransferIds.length > 0 ||
    (finances.length >= 2 &&
      finances.every((f) => f.sellerCreditTransferId && f.sellerCreditCents >= NEITHER_LABEL_CHARGED_PER_TX_CENTS) &&
      creditedFromDb >= NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS);

  const remainingCreditCents = alreadyFullyCredited
    ? 0
    : Math.max(0, NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS - Math.min(credited, NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS));

  return {
    orderId,
    classification: "NEITHER_LABEL_CHARGED",
    proposedCreditCents: NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS,
    idempotencyKey,
    destinationAccountId: destination,
    destinationAccountValid,
    shippoTransactionIds,
    stripeReversalIds,
    liveShippingSessionId: order.liveShippingSessionId,
    platformAvailableUsdCents,
    platformPendingUsdCents,
    balanceSufficient:
      platformAvailableUsdCents != null &&
      platformAvailableUsdCents >= NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS,
    existingRestoringTransferIds,
    alreadyFullyCredited,
    remainingCreditCents,
    expectedOrderSummariesAfterRepair: {
      shippingLabelCostCents: 0,
      shippingLabelCostReversedCents: 0,
    },
  };
}

export type ApplyNeitherLabelChargedResult =
  | {
      ok: true;
      transferId: string | null;
      skipped: boolean;
      summary: Awaited<ReturnType<typeof recalculateOrderLabelFinanceSummary>>;
    }
  | { ok: false; code: string; error: string };

/**
 * Ensure two failed_purchase finance rows exist (initial + replacement) with clawback evidence.
 * Does not issue Stripe credits — call only from apply after plan checks.
 */
export async function ensureNeitherLabelChargedFinanceRows(args: {
  orderId: string;
  liveShippingSessionId: string | null;
  stripeReversalIds: string[];
}): Promise<void> {
  const packages = await prisma.shipmentPackage.findMany({
    where: {
      OR: [
        { orderId: args.orderId },
        ...(args.liveShippingSessionId
          ? [{ liveShippingSessionId: args.liveShippingSessionId }]
          : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  const withTx = packages.filter((p) => p.shippoTransactionId?.trim());
  const targets =
    withTx.length >= 2
      ? withTx.slice(0, 2)
      : NEITHER_LABEL_CHARGED_KNOWN_TX_IDS.map((txId, i) => ({
          id: null as string | null,
          shippoTransactionId: txId,
          shippoShipmentId: null as string | null,
          labelCostCents: NEITHER_LABEL_CHARGED_PER_TX_CENTS,
          packageIndex: i,
        }));

  for (let i = 0; i < targets.length; i++) {
    const pkg = targets[i]!;
    const txId = (pkg.shippoTransactionId ?? "").trim();
    if (!txId) continue;
    const purpose = i === 0 ? "initial" : "replacement";
    const replaces =
      i === 0 ? null : (targets[0]?.shippoTransactionId ?? NEITHER_LABEL_CHARGED_KNOWN_TX_IDS[0]);
    const reversalId = args.stripeReversalIds[i] ?? null;

    await prisma.shipmentLabelFinance.upsert({
      where: {
        orderId_shippoTransactionId: { orderId: args.orderId, shippoTransactionId: txId },
      },
      create: {
        orderId: args.orderId,
        liveShippingSessionId: args.liveShippingSessionId,
        shipmentPackageId: "id" in pkg && typeof pkg.id === "string" ? pkg.id : null,
        shippoTransactionId: txId,
        shippoShipmentId: "shippoShipmentId" in pkg ? (pkg.shippoShipmentId ?? null) : null,
        labelCostCents: 0,
        quotedLabelCostCents: NEITHER_LABEL_CHARGED_PER_TX_CENTS,
        purpose,
        replacesShippoTransactionId: replaces,
        status: "failed_purchase",
        sellerClawbackCents: NEITHER_LABEL_CHARGED_PER_TX_CENTS,
        sellerClawbackReversalId: reversalId,
        shippoStatus: "ERROR",
        shippoObjectState: "INVALID",
      },
      update: {
        status: "failed_purchase",
        labelCostCents: 0,
        quotedLabelCostCents: NEITHER_LABEL_CHARGED_PER_TX_CENTS,
        purpose,
        replacesShippoTransactionId: replaces,
        sellerClawbackCents: NEITHER_LABEL_CHARGED_PER_TX_CENTS,
        ...(reversalId ? { sellerClawbackReversalId: reversalId } : {}),
        shippoStatus: "ERROR",
        shippoObjectState: "INVALID",
      },
    });
  }
}

/**
 * Apply NEITHER_LABEL_CHARGED repair: one 3502¢ Connect transfer, allocate 1751¢ credit per failed finance row.
 * Dry-run callers must not invoke this. Idempotent via Stripe metadata + repair idempotency key.
 */
export async function applyNeitherLabelChargedRepair(orderId: string): Promise<ApplyNeitherLabelChargedResult> {
  const plan = await planNeitherLabelChargedRepair(orderId);
  if (!plan.destinationAccountId) {
    return { ok: false, code: "SELLER_NO_CONNECT", error: "Seller has no Stripe Connect account." };
  }
  if (plan.destinationAccountValid === false) {
    return {
      ok: false,
      code: "DESTINATION_ACCOUNT_INVALID",
      error: `Destination Connect account ${plan.destinationAccountId} is not valid.`,
    };
  }
  if (!isStripeConfigured()) {
    return { ok: false, code: "STRIPE_NOT_CONFIGURED", error: "Stripe is not configured." };
  }

  // Re-check Stripe before any mutation (do not trust DB alone).
  const existing = await findExistingFailedLabelRepairTransfer({
    destinationAccountId: plan.destinationAccountId,
    orderId,
    idempotencyKey: plan.idempotencyKey,
  });
  let transferId =
    existing.find((t) => t.amount === NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS)?.id ??
    plan.existingRestoringTransferIds[0] ??
    null;
  const hadExisting = Boolean(transferId);

  // Only require available balance when creating a new transfer. Pending never counts.
  if (!transferId && !plan.balanceSufficient) {
    return {
      ok: false,
      code: "INSUFFICIENT_PLATFORM_BALANCE",
      error: `Platform available balance (${plan.platformAvailableUsdCents ?? 0}¢) < ${NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS}¢. Pending (${plan.platformPendingUsdCents ?? 0}¢) is not counted.`,
    };
  }

  // Collect reversal IDs from Stripe when finance rows are not yet backfilled.
  let stripeReversalIds = [...plan.stripeReversalIds];
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { stripeTransferId: true, stripePaymentIntentId: true, liveShippingSessionId: true },
  });
  if (stripeReversalIds.length < 2 && order?.stripeTransferId && isStripeConfigured()) {
    const stripe = getStripe();
    const reversals = await stripe.transfers.listReversals(order.stripeTransferId, { limit: 20 });
    stripeReversalIds = reversals.data
      .filter((r) => r.amount === NEITHER_LABEL_CHARGED_PER_TX_CENTS)
      .sort((a, b) => (a.created ?? 0) - (b.created ?? 0))
      .slice(0, 2)
      .map((r) => r.id);
  }

  await ensureNeitherLabelChargedFinanceRows({
    orderId,
    liveShippingSessionId: order?.liveShippingSessionId ?? plan.liveShippingSessionId,
    stripeReversalIds,
  });

  const finances = await prisma.shipmentLabelFinance.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
  });
  if (finances.length < 2) {
    return {
      ok: false,
      code: "FINANCE_ROWS_MISSING",
      error: "Need two ShipmentLabelFinance rows for the failed Shippo transactions before repair.",
    };
  }

  // DB already shows full credits AND Stripe already has the transfer → sync summaries only.
  const dbFullyCredited =
    finances.every(
      (f) => f.sellerCreditTransferId && f.sellerCreditCents >= NEITHER_LABEL_CHARGED_PER_TX_CENTS,
    ) &&
    finances.reduce((s, f) => s + Math.max(0, f.sellerCreditCents), 0) >=
      NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS;
  if (hadExisting && dbFullyCredited) {
    const summary = await recalculateOrderLabelFinanceSummary(orderId);
    await prisma.order.update({
      where: { id: orderId },
      data: {
        shippingLabelCostCents: 0,
        shippingLabelCostReversedCents: 0,
        shippingLabelCostReversalId: null,
      },
    });
    return { ok: true, transferId, skipped: true, summary };
  }

  if (!transferId) {
    // Re-check available balance immediately before mutation (pending still excluded).
    const stripe = getStripe();
    const balance = await stripe.balance.retrieve();
    const availableUsd = (balance.available ?? [])
      .filter((b) => b.currency === "usd")
      .reduce((sum, b) => sum + (b.amount ?? 0), 0);
    if (availableUsd < NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS) {
      return {
        ok: false,
        code: "INSUFFICIENT_PLATFORM_BALANCE",
        error: `Platform available balance (${availableUsd}¢) < ${NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS}¢. Pending is not counted.`,
      };
    }

    const transfer = await stripe.transfers.create(
      {
        amount: NEITHER_LABEL_CHARGED_TOTAL_CREDIT_CENTS,
        currency: "usd",
        destination: plan.destinationAccountId,
        description: `Failed Shippo label clawback refund for order ${orderId}`,
        metadata: {
          orderId,
          liveShippingSessionId: order?.liveShippingSessionId ?? "",
          shippoTransactionIds: finances.map((f) => f.shippoTransactionId).join(","),
          originalStripeReversalIds: finances
            .map((f) => f.sellerClawbackReversalId)
            .filter(Boolean)
            .join(","),
          reason: "failed_shippo_label_clawback_refund",
          repairClassification: "NEITHER_LABEL_CHARGED",
          repairIdempotencyKey: plan.idempotencyKey,
        },
        ...(order?.stripePaymentIntentId?.trim()
          ? { transfer_group: order.stripePaymentIntentId.trim() }
          : {}),
      },
      { idempotencyKey: plan.idempotencyKey },
    );
    transferId = transfer.id;
  }

  // Persist credits only after Stripe transfer id is known (covers Stripe-success / DB-failure recovery).
  for (const row of finances) {
    if (
      row.sellerCreditTransferId === transferId &&
      row.sellerCreditCents >= NEITHER_LABEL_CHARGED_PER_TX_CENTS
    ) {
      continue;
    }
    await prisma.shipmentLabelFinance.update({
      where: { id: row.id },
      data: {
        status: "failed_purchase",
        labelCostCents: 0,
        quotedLabelCostCents: row.quotedLabelCostCents ?? NEITHER_LABEL_CHARGED_PER_TX_CENTS,
        sellerCreditCents: NEITHER_LABEL_CHARGED_PER_TX_CENTS,
        sellerCreditTransferId: transferId,
        creditIdempotencyKey: `${plan.idempotencyKey}:${row.shippoTransactionId}`,
        repairCreditIdempotencyKey: plan.idempotencyKey,
        creditFailedAt: null,
        creditFailureDetail: null,
      },
    });
  }

  const summary = await recalculateOrderLabelFinanceSummary(orderId);
  await prisma.order.update({
    where: { id: orderId },
    data: {
      shippingLabelCostCents: 0,
      shippingLabelCostReversedCents: 0,
      // Legacy latest-value field — not outstanding deduction proof after label-finance reconciliation.
      shippingLabelCostReversalId: null,
    },
  });

  return { ok: true, transferId, skipped: hadExisting, summary };
}
