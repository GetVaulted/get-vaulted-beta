import { prisma } from "@/lib/prisma";
import { isStripePaymentIntentId } from "@/lib/stripe-payment-intent-id";

/**
 * One-time historical repair (financial-reconciliation-audit-2026-08 bug #18): a handful of live
 * variant-purchase orders paid via the PayPal/Venmo buyer rail had their PayPal capture id written
 * into `Order.stripePaymentIntentId` — a column that must only ever hold a real Stripe
 * PaymentIntent id — by a bug fixed alongside this repair. See `stripe-payment-intent-id.ts` and
 * every `finalize*Paid` call site in `live-item-variant-purchase.ts` /
 * `live-item-variant-batch-purchase.ts` / `live-buy-now-purchase.ts`.
 *
 * Safety (never touches a real Stripe order):
 * - Only ever clears `stripePaymentIntentId` to `null` — no other field is written.
 * - Only clears it when, for the SAME row read fresh from the DB, all of the following hold:
 *     1. `paymentProcessor === "PAYPAL_VENMO"`.
 *     2. `processorPaymentId` is present and, once trimmed, is EXACTLY equal to the value
 *        currently sitting in `stripePaymentIntentId` — proof the two columns hold the same
 *        mislabeled id, not merely "this happens to be a PayPal order".
 *     3. `stripePaymentIntentId` is NOT Stripe-shaped (`pi_…`) — belt-and-suspenders in case a
 *        PayPal-rail order ever legitimately also carries a real Stripe id for some other reason.
 * - The final write is a conditional `updateMany` re-checking all three fields against the exact
 *   values just read, so a row that changed between read and write (e.g. re-paid, reprocessed) is
 *   safely skipped rather than blindly cleared.
 * - Idempotent: re-running finds nothing left to do once `stripePaymentIntentId` is null.
 * - Auditable: returns the exact list of repaired order ids and every skipped candidate with a
 *   reason, never just a bare count.
 */

export type PayPalMislabeledOrderRepairResult = {
  candidatesInspected: number;
  repaired: string[];
  skipped: Array<{ orderId: string; reason: string }>;
};

export async function repairPayPalMislabeledStripePaymentIntentIds(): Promise<PayPalMislabeledOrderRepairResult> {
  const candidates = await prisma.order.findMany({
    where: {
      paymentProcessor: "PAYPAL_VENMO",
      stripePaymentIntentId: { not: null },
    },
    select: { id: true, stripePaymentIntentId: true, processorPaymentId: true },
  });

  const repaired: string[] = [];
  const skipped: Array<{ orderId: string; reason: string }> = [];

  for (const order of candidates) {
    const currentStripeId = order.stripePaymentIntentId?.trim() ?? "";

    if (isStripePaymentIntentId(currentStripeId)) {
      skipped.push({
        orderId: order.id,
        reason: "stripePaymentIntentId is Stripe-shaped (pi_…) — not the mislabeling this repairs",
      });
      continue;
    }

    const processorPaymentId = order.processorPaymentId?.trim() ?? "";
    if (!processorPaymentId) {
      skipped.push({
        orderId: order.id,
        reason: "processorPaymentId is missing — cannot verify this is the known mislabeling",
      });
      continue;
    }
    if (processorPaymentId !== currentStripeId) {
      skipped.push({
        orderId: order.id,
        reason: "processorPaymentId does not match stripePaymentIntentId — not the known mislabeling",
      });
      continue;
    }

    // Re-check the exact same values at write time — if the row changed since it was read (e.g.
    // reprocessed, refunded, replayed), skip rather than clearing based on stale data.
    const cleared = await prisma.order.updateMany({
      where: {
        id: order.id,
        paymentProcessor: "PAYPAL_VENMO",
        processorPaymentId: order.processorPaymentId,
        stripePaymentIntentId: order.stripePaymentIntentId,
      },
      data: { stripePaymentIntentId: null },
    });

    if (cleared.count > 0) {
      repaired.push(order.id);
    } else {
      skipped.push({
        orderId: order.id,
        reason: "row changed since it was read — skipped for safety, re-run to retry",
      });
    }
  }

  return { candidatesInspected: candidates.length, repaired, skipped };
}
