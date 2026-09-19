/**
 * Guards against non-Stripe processor ids (PayPal/Venmo transaction ids) ever being persisted
 * into a `stripePaymentIntentId` column, or passed to the Stripe API as if they were a real
 * PaymentIntent id — see financial-reconciliation-audit-2026-08 bug #18.
 *
 * Root cause: several live-purchase finalize functions accepted a single generic
 * "payment reference" parameter that was, in practice, fed either a real Stripe PaymentIntent id
 * (`pi_…`) or a PayPal/Venmo capture id (e.g. `21V88625P2888003D`) depending on which buyer rail
 * was used — and wrote whatever they got directly into `stripePaymentIntentId`. Stripe PaymentIntent
 * ids are always shaped `pi_<alphanumeric>`; nothing else should ever be treated as one.
 */

/** Stripe PaymentIntent id (`pi_…`). */
export function isStripePaymentIntentId(raw: string | null | undefined): raw is string {
  if (!raw) return false;
  const s = raw.trim();
  return s.startsWith("pi_") && s.length >= 6 && /^pi_[a-zA-Z0-9]+$/.test(s);
}

/**
 * Narrow a possibly-mislabeled payment reference down to a real Stripe PaymentIntent id.
 * Returns `null` for anything that isn't Stripe-shaped (PayPal/Venmo ids, empty strings, etc.)
 * instead of ever passing it through — callers should treat the result exactly like "no id".
 */
export function sanitizeStripePaymentIntentId(raw: string | null | undefined): string | null {
  if (!isStripePaymentIntentId(raw)) return null;
  return raw.trim();
}
