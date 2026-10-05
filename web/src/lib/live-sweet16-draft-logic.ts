/**
 * Pure rules for the Sweet 16 draft that are easy to get wrong and worth testing in isolation
 * (no Prisma / network imports -- see live-sweet16-draft.ts for the DB-backed callers).
 */

/** A pending checkout older than this is treated as abandoned and no longer holds up the draft. */
export const SWEET16_PENDING_PAYMENT_MAX_AGE_MS = 10 * 60_000;

/**
 * One buyer can own several of the 16 slots, and every slot gets its own turn. Which of the
 * viewer's purchases counts as "theirs" therefore depends on whose turn it is: if they own the
 * purchase that is up now, that one; otherwise their first (stable) purchase.
 *
 * The previous implementation took an arbitrary purchase, so a buyer holding slots A and B could
 * be told "not your turn" on B's turn and have the server pick for them after the timeout.
 */
export function resolveViewerPurchaseId(
  ownedPurchaseIds: readonly string[],
  currentTurnPurchaseId: string | null,
): string | null {
  if (ownedPurchaseIds.length === 0) return null;
  if (currentTurnPurchaseId && ownedPurchaseIds.includes(currentTurnPurchaseId)) {
    return currentTurnPurchaseId;
  }
  return ownedPurchaseIds[0] ?? null;
}

export type SlotPaymentRow = {
  paymentStatus: string;
  createdAtMs: number;
};

/**
 * Slots that are reserved but not yet paid. The board reads "sold out" as soon as stock is
 * reserved, but the draft's turn order only contains paid purchases -- starting while a checkout
 * is still in flight would leave that buyer without a turn (and without a team) even if they pay
 * a moment later. Abandoned checkouts (older than the max age) are ignored so they can't block
 * the host forever.
 */
export function countBlockingPendingPayments(
  rows: readonly SlotPaymentRow[],
  nowMs: number,
  maxAgeMs: number = SWEET16_PENDING_PAYMENT_MAX_AGE_MS,
): number {
  return rows.filter((r) => r.paymentStatus === "pending_payment" && nowMs - r.createdAtMs < maxAgeMs).length;
}
