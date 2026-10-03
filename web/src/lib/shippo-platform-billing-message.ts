/**
 * Detects when a Shippo transaction message is actually about *our* Shippo platform account
 * being past due (e.g. "Your request has failed due to a billing issue.",
 * "Labels are not available while invoices are past due.") rather than anything the seller did.
 *
 * These raw Shippo messages used to be shown to the seller verbatim when a label purchase failed
 * (see `shippoFailureMessage` in `shippo-transaction-label.ts`), which reads as "your billing has
 * a problem" — the seller has no billing relationship with Shippo at all, so there's nothing for
 * them to fix. This is squarely our own platform account, not seller-actionable, so it should
 * point them to support instead of naming "billing".
 */
const PLATFORM_BILLING_MESSAGE_PATTERNS = [
  /billing issue/i,
  /invoices are past due/i,
  /labels are not available while invoices/i,
];

export function isShippoPlatformBillingMessage(text: string): boolean {
  return PLATFORM_BILLING_MESSAGE_PATTERNS.some((p) => p.test(text));
}

export const SHIPPO_PLATFORM_BILLING_USER_MESSAGE =
  "Shipping labels are temporarily unavailable. Please contact support.";
