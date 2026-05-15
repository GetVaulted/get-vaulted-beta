import { EscrowStatus } from "@/generated/prisma/enums";

/** Map Trustap `GET /transactions/{id}` `status` field to internal lifecycle. */
export function mapTrustapTransactionStatus(status: string): EscrowStatus | null {
  const s = status.trim().toLowerCase();
  if (!s) return null;
  const table: Record<string, EscrowStatus> = {
    created: EscrowStatus.pending,
    joined: EscrowStatus.pending,
    paid: EscrowStatus.buyer_paid,
    tracked: EscrowStatus.seller_shipped,
    delivered: EscrowStatus.delivered,
    complained: EscrowStatus.disputed,
    cancelled: EscrowStatus.cancelled,
    canceled: EscrowStatus.cancelled,
    funds_released: EscrowStatus.funds_released,
  };
  return table[s] ?? null;
}

/**
 * Map Trustap webhook `code` (e.g. `basic_tx.paid`) to internal escrow status.
 * @see https://docs.trustap.com/docs/concepts/webhooks
 */
export function mapTrustapWebhookEventCode(code: string): EscrowStatus | null {
  const c = code.trim().toLowerCase();
  if (!c) return null;
  const table: Record<string, EscrowStatus> = {
    "basic_tx.joined": EscrowStatus.pending,
    "basic_tx.claimed": EscrowStatus.pending,
    "basic_tx.cancelled": EscrowStatus.cancelled,
    "basic_tx.payment_failed": EscrowStatus.pending,
    "basic_tx.paid": EscrowStatus.buyer_paid,
    "basic_tx.payment_review_flagged": EscrowStatus.pending,
    "basic_tx.tracked": EscrowStatus.seller_shipped,
    "basic_tx.delivered": EscrowStatus.delivered,
    "basic_tx.complained": EscrowStatus.disputed,
    "basic_tx.funds_released": EscrowStatus.funds_released,
    "basic_tx.funds_refunded": EscrowStatus.cancelled,
  };
  return table[c] ?? null;
}

/** Derive inspection period when delivered + complaint window active (best-effort). */
export function refineEscrowStatusFromTrustapPreview(
  mapped: EscrowStatus,
  preview: Record<string, unknown> | null,
): EscrowStatus {
  if (mapped !== EscrowStatus.delivered || !preview) return mapped;
  const deadline = preview.complaint_period_deadline;
  const ended = preview.complaint_period_ended;
  if (typeof deadline === "string" && !ended) {
    return EscrowStatus.inspection_period;
  }
  return mapped;
}
