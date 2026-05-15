/** Stripe PaymentMethod id attached to a Customer (`pm_…`). */
export function isStripePaymentMethodId(raw: string): boolean {
  const s = raw.trim();
  return s.startsWith("pm_") && s.length >= 20 && /^pm_[a-zA-Z0-9]+$/.test(s);
}
