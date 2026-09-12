import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { repairPayPalMislabeledStripePaymentIntentIds } from "@/lib/admin/repair-paypal-mislabeled-order-ids";

export const runtime = "nodejs";

/**
 * POST — One-time historical repair for financial-reconciliation-audit-2026-08 bug #18: PayPal/
 * Venmo capture ids that were mislabeled into `Order.stripePaymentIntentId`. Idempotent and safe
 * to re-run; only clears the field when the exact-match safety predicate holds (see the lib for
 * the full three-part check). Never touches a real Stripe order. Small, bounded candidate set
 * (paymentProcessor=PAYPAL_VENMO with a non-null stripePaymentIntentId) — no pagination needed.
 */
export async function POST() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const result = await repairPayPalMislabeledStripePaymentIntentIds();
  return NextResponse.json({ ok: true, ...result });
}
