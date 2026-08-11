import { shippoFetch, shippoGetTransaction, type ShippoTransaction } from "@/lib/shippo";

export type ShippoLabelRefundVerdict =
  | "refunded"
  | "refund_pending"
  | "chargeable"
  | "failed_purchase"
  | "unknown";

export type ShippoRefundDetail = {
  objectId: string | null;
  status: string | null;
  amount: string | number | null;
  currency: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  transaction: string | null;
};

export type ShippoPurchaseProof = {
  statusIsSuccess: boolean;
  hasLabelUrl: boolean;
  hasTrackingNumber: boolean;
  affirmativelyPurchased: boolean;
};

export type ShippoLabelRefundEvidence = {
  shippoTransactionId: string;
  transactionStatus: string | null;
  refundStatuses: string[];
  refunds: ShippoRefundDetail[];
  purchaseProof: ShippoPurchaseProof;
  remainsChargeable: boolean | null;
  lookupError: string | null;
  verdict: ShippoLabelRefundVerdict;
  shippoClassification:
    | "explicitly_refunded"
    | "refund_pending"
    | "affirmatively_purchased_not_refunded"
    | "failed_purchase_no_charge_proof"
    | "unknown_api_incomplete";
  messages: string[];
  rawStatusValues: {
    transactionStatus: string | null;
    refundStatuses: string[];
  };
  rawTransaction?: ShippoTransaction & Record<string, unknown>;
};

type ShippoRefundListItem = {
  object_id?: string;
  status?: string;
  transaction?: string;
  amount?: string | number;
  currency?: string;
  object_created?: string;
  object_updated?: string;
};

/** Affirmative proof that Shippo successfully purchased/billed a label. Empty refunds alone never qualify. */
export function extractShippoPurchaseProof(
  tx: Pick<ShippoTransaction, "status" | "label_url" | "tracking_number"> & Record<string, unknown>,
): ShippoPurchaseProof {
  const statusIsSuccess = String(tx.status ?? "").toUpperCase() === "SUCCESS";
  const objectState = String(tx.object_state ?? "").toUpperCase();
  const hasLabelUrl = Boolean(typeof tx.label_url === "string" && tx.label_url.trim());
  const tracking =
    typeof tx.tracking_number === "string"
      ? tx.tracking_number.trim()
      : typeof (tx as { tracking_number?: unknown }).tracking_number === "string"
        ? String((tx as { tracking_number?: string }).tracking_number).trim()
        : "";
  const hasTrackingNumber = tracking.length > 0;
  // SUCCESS is Shippo's authoritative purchased state — never when object_state is INVALID.
  // ERROR/QUEUED/WAITING without SUCCESS are never affirmatively purchased.
  const affirmativelyPurchased = statusIsSuccess && objectState !== "INVALID";
  return { statusIsSuccess, hasLabelUrl, hasTrackingNumber, affirmativelyPurchased };
}

/**
 * Prove Shippo did not bill postage for a failed transaction.
 * `billing.payments: []` on ERROR/INVALID + billing failure messages is authoritative.
 */
export function extractProvenNoShippoCharge(
  tx: Record<string, unknown>,
  messages: string[] = [],
): boolean {
  const status = String(tx.status ?? "").toUpperCase();
  if (status !== "ERROR" && status !== "FAILED") return false;
  const objectState = String(tx.object_state ?? "").toUpperCase();
  const billing = tx.billing;
  const paymentsEmpty =
    billing != null &&
    typeof billing === "object" &&
    Array.isArray((billing as { payments?: unknown }).payments) &&
    (billing as { payments: unknown[] }).payments.length === 0;
  const billingFailureMessage = messages.some(
    (m) =>
      /billing issue/i.test(m) ||
      /invoices are past due/i.test(m) ||
      /labels are not available while invoices/i.test(m),
  );
  // Empty payments on a failed/invalid tx is proof no postage payment was collected.
  if (paymentsEmpty && (objectState === "INVALID" || billingFailureMessage || status === "ERROR")) {
    return true;
  }
  return false;
}

export function extractShippoTransactionMessages(
  tx: { messages?: { text?: string }[] | null } | null | undefined,
): string[] {
  if (!tx?.messages?.length) return [];
  return tx.messages
    .map((m) => (typeof m?.text === "string" ? m.text.trim() : ""))
    .filter(Boolean);
}

/**
 * Classify refund/chargeability from Shippo evidence.
 * Do not treat an empty refund list as chargeable — especially for ERROR transactions.
 */
export function classifyShippoLabelRefundVerdict(args: {
  transactionStatus: string | null;
  refundStatuses?: string[];
  purchaseProof: ShippoPurchaseProof;
  /** When ERROR/FAILED and billing API (or equivalent) proves zero charge. */
  provenNoShippoCharge?: boolean;
}): ShippoLabelRefundVerdict {
  const tx = (args.transactionStatus ?? "").toUpperCase();
  const refunds = (args.refundStatuses ?? []).map((s) => s.toUpperCase());

  if (tx === "REFUNDED" || refunds.includes("SUCCESS")) return "refunded";
  if (tx === "REFUNDPENDING" || refunds.includes("QUEUED") || refunds.includes("PENDING")) {
    return "refund_pending";
  }

  // Affirmatively purchased and not refunded (including REFUNDREJECTED after SUCCESS).
  if (args.purchaseProof.affirmativelyPurchased) {
    if (tx === "REFUNDREJECTED" || refunds.includes("ERROR") || tx === "SUCCESS") {
      return "chargeable";
    }
    return "chargeable";
  }

  if (tx === "ERROR" || tx === "FAILED") {
    if (args.provenNoShippoCharge) return "failed_purchase";
    // ERROR without billing proof → unknown (manual review), never chargeable.
    return "unknown";
  }

  if (tx === "QUEUED" || tx === "WAITING") return "unknown";
  if (!tx && refunds.length === 0) return "unknown";
  return "unknown";
}

function classificationFromVerdict(verdict: ShippoLabelRefundVerdict): ShippoLabelRefundEvidence["shippoClassification"] {
  switch (verdict) {
    case "refunded":
      return "explicitly_refunded";
    case "refund_pending":
      return "refund_pending";
    case "chargeable":
      return "affirmatively_purchased_not_refunded";
    case "failed_purchase":
      return "failed_purchase_no_charge_proof";
    default:
      return "unknown_api_incomplete";
  }
}

/**
 * Verify whether a Shippo label is refunded/voided, still chargeable, failed, or unknown.
 * API errors / missing responses → verdict "unknown" (never treated as chargeable or refunded).
 */
export async function verifyShippoLabelRefundStatus(
  shippoTransactionId: string,
): Promise<ShippoLabelRefundEvidence> {
  const empty = (txId: string, lookupError: string | null = null): ShippoLabelRefundEvidence => ({
    shippoTransactionId: txId,
    transactionStatus: null,
    refundStatuses: [],
    refunds: [],
    purchaseProof: {
      statusIsSuccess: false,
      hasLabelUrl: false,
      hasTrackingNumber: false,
      affirmativelyPurchased: false,
    },
    remainsChargeable: null,
    lookupError,
    verdict: "unknown",
    shippoClassification: "unknown_api_incomplete",
    messages: [],
    rawStatusValues: { transactionStatus: null, refundStatuses: [] },
  });

  const txId = shippoTransactionId.trim();
  if (!txId) return empty("");

  let transactionStatus: string | null = null;
  let rawTransaction: (ShippoTransaction & Record<string, unknown>) | undefined;
  try {
    rawTransaction = (await shippoGetTransaction(txId)) as ShippoTransaction & Record<string, unknown>;
    transactionStatus = typeof rawTransaction.status === "string" ? rawTransaction.status.toUpperCase() : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[shippo_label_refund_status] transaction lookup failed", {
      shippoTransactionId: txId,
      error: msg,
    });
    return empty(txId, msg);
  }

  const refundStatuses: string[] = [];
  const refunds: ShippoRefundDetail[] = [];
  try {
    const list = (await shippoFetch(`/refunds/?transaction=${encodeURIComponent(txId)}`)) as {
      results?: ShippoRefundListItem[];
    };
    // Do not trust Shippo's `?transaction=` query param — confirmed (2026-08-10 audit) that it is
    // not honored and the endpoint can return the same account-wide refund list regardless of the
    // transaction id queried. A single unrelated PENDING/QUEUED refund anywhere on the account
    // would otherwise poison the verdict of every unrelated transaction to "refund_pending". Only
    // trust a refund whose own `transaction` field matches the id we asked about.
    for (const r of list.results ?? []) {
      if (typeof r.transaction !== "string" || r.transaction !== txId) continue;
      if (typeof r.status === "string") refundStatuses.push(r.status.toUpperCase());
      refunds.push({
        objectId: typeof r.object_id === "string" ? r.object_id : null,
        status: typeof r.status === "string" ? r.status.toUpperCase() : null,
        amount: r.amount ?? null,
        currency: typeof r.currency === "string" ? r.currency : null,
        createdAt: typeof r.object_created === "string" ? r.object_created : null,
        updatedAt: typeof r.object_updated === "string" ? r.object_updated : null,
        transaction: r.transaction,
      });
    }
  } catch (e) {
    console.warn("[shippo_label_refund_status] refund list lookup failed", {
      shippoTransactionId: txId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const purchaseProof = extractShippoPurchaseProof(rawTransaction);
  const messages = extractShippoTransactionMessages(rawTransaction);
  const provenNoShippoCharge = extractProvenNoShippoCharge(rawTransaction, messages);
  const verdict = classifyShippoLabelRefundVerdict({
    transactionStatus,
    refundStatuses,
    purchaseProof,
    provenNoShippoCharge,
  });

  return {
    shippoTransactionId: txId,
    transactionStatus,
    refundStatuses,
    refunds,
    purchaseProof,
    remainsChargeable: verdict === "chargeable" ? true : verdict === "refunded" || verdict === "failed_purchase" ? false : null,
    lookupError: null,
    verdict,
    shippoClassification: classificationFromVerdict(verdict),
    messages,
    rawStatusValues: { transactionStatus, refundStatuses: [...refundStatuses] },
    rawTransaction,
  };
}

/** Map Shippo verdict onto ShipmentLabelFinanceStatus for a replaced prior label. */
export function financeStatusFromShippoVerdict(
  verdict: ShippoLabelRefundVerdict,
): "refunded" | "refund_pending" | "replaced" | "active" | "failed_purchase" {
  switch (verdict) {
    case "refunded":
      return "refunded";
    case "refund_pending":
      return "refund_pending";
    case "chargeable":
      return "replaced";
    case "failed_purchase":
      return "failed_purchase";
    default:
      // Unknown: keep auditable pending state rather than assuming refunded or chargeable.
      return "refund_pending";
  }
}

/**
 * Affirmative successful Shippo label purchase required before any seller clawback.
 * Requires SUCCESS status, a transaction id, and not INVALID object state.
 */
export function isShippoLabelPurchaseSuccessful(args: {
  status?: string | null;
  transactionId?: string | null;
  objectState?: string | null;
  labelUrl?: string | null;
}): boolean {
  const status = String(args.status ?? "").toUpperCase();
  const objectState = String(args.objectState ?? "").toUpperCase();
  const txId = args.transactionId?.trim() ?? "";
  if (status !== "SUCCESS") return false;
  if (!txId) return false;
  if (objectState === "INVALID") return false;
  return true;
}
