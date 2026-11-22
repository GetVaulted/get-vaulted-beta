/**
 * When a winner's saved card needs bank verification (3D Secure), the host must not be able to cancel the
 * retry before the winner has had time to finish verifying. Pure helpers so the rule is unit-testable.
 */

export const BANK_VERIFICATION_CANCEL_GRACE_MS = 90_000;

/** True for the "bank needs to confirm this purchase" reason (not phone verification or other reasons). */
export function isBankVerificationReason(reason: string | null | undefined): boolean {
  const lower = (reason ?? "").trim().toLowerCase();
  return lower.includes("additional verification") || lower.includes("authentication required");
}

/**
 * Milliseconds the host still has to wait before cancelling this failure (0 = can cancel now).
 * Fails open: anything other than a bank-verification failure with a readable timestamp returns 0.
 */
export function cancelGraceRemainingMs(
  failure: { failureReason: string | null; failedAt: Date },
  nowMs: number,
): number {
  if (!isBankVerificationReason(failure.failureReason)) return 0;
  const failedMs = failure.failedAt.getTime();
  if (!Number.isFinite(failedMs)) return 0;
  const remaining = failedMs + BANK_VERIFICATION_CANCEL_GRACE_MS - nowMs;
  return remaining > 0 ? remaining : 0;
}
