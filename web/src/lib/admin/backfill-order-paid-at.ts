import { prisma } from "@/lib/prisma";
import { persistOrderStripeChargeLedger } from "@/lib/stripe-charge-ledger";

/**
 * Historical backfill for `Order.paidAt` (financial reconciliation audit, bug #1).
 *
 * Every order that reaches a paid-bucket status *going forward* gets `paidAt` set at that moment
 * (see `finalizeStripeMarketplaceOrderPaid`, `applyEscrowBuyerFundsSecured`, layaway completion,
 * `live-giveaway-fulfillment.ts`). This backfill is only for orders that reached that status
 * *before* this code shipped and were left with `paidAt = null`.
 *
 * Idempotent and safe to re-run: only ever touches rows where `paidAt IS NULL`, processes a bounded
 * batch per call (never downloads unbounded Stripe history), and reuses the existing
 * `persistOrderStripeChargeLedger` machinery rather than duplicating the Stripe fetch/extract logic.
 * Most-recent-first ordering so the orders that matter for a near-term Stripe reconciliation
 * comparison get fixed first.
 *
 * Every order backfilled here ends up tagged with `paidAtSource`:
 * - "stripe_authoritative": a real Stripe Charge.created was recovered — set exclusively inside
 *   `persistOrderStripeChargeLedger`, never here directly.
 * - "created_at_fallback": no Stripe charge was recoverable (no PaymentIntent on the order, or the
 *   Stripe fetch failed/returned no charge) — paidAt was copied from createdAt and must not be
 *   treated as Stripe-verified. Set explicitly on every fallback write in this file.
 * The two counters below are derived from that same per-order tag, not from whether the async call
 * merely resolved without throwing — a Stripe call can resolve successfully and still yield no
 * usable charge (e.g. a PaymentIntent with no completed charge yet), which must count as a
 * fallback, not an upgrade.
 */

/** Every paymentStatus value that means "a payment happened at some point" — see admin-reconciliation.ts. */
const EVER_PAID_STATUSES = ["paid", "layaway_completed", "refunded", "chargeback"] as const;

/** Concurrent Stripe lookups per batch — same conservative limit as recalculateAllSellerPayoutTiers. */
const BACKFILL_CONCURRENCY = 5;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type PaidAtBackfillResult = {
  candidatesInBatch: number;
  /** paidAtSource = stripe_authoritative — a real Charge.created was recovered from Stripe. */
  stripeAuthoritative: number;
  /** paidAtSource = created_at_fallback — no Stripe charge was recoverable; NOT Stripe-verified. */
  createdAtFallback: number;
  /** The per-order write itself threw (DB error, unexpected exception) — logged, not silently dropped. */
  failed: number;
  /** True if this batch was full — call again, there is likely more work. */
  mayHaveMore: boolean;
};

async function fallBackToCreatedAt(orderId: string, createdAt: Date): Promise<void> {
  await prisma.order.update({
    where: { id: orderId, paidAt: null },
    data: { paidAt: createdAt, paidAtSource: "created_at_fallback" },
  });
}

/**
 * Process one bounded batch of orders missing `paidAt`. Call repeatedly (e.g. from an admin route
 * or a script loop) until `mayHaveMore` is false.
 */
export async function backfillOrderPaidAtBatch(opts?: {
  limit?: number;
}): Promise<PaidAtBackfillResult> {
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 200));

  const candidates = await prisma.order.findMany({
    where: {
      paidAt: null,
      paymentStatus: { in: [...EVER_PAID_STATUSES] },
    },
    select: { id: true, stripePaymentIntentId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (candidates.length === 0) {
    return {
      candidatesInBatch: 0,
      stripeAuthoritative: 0,
      createdAtFallback: 0,
      failed: 0,
      mayHaveMore: false,
    };
  }

  const withPi = candidates.filter((o) => o.stripePaymentIntentId?.trim());
  const withoutPi = candidates.filter((o) => !o.stripePaymentIntentId?.trim());

  // No Stripe PaymentIntent at all (giveaway $0 orders, or pre-Stripe legacy rows) — there is no
  // Stripe truth to recover for these, so createdAt is the best available payment-date proxy.
  // These orders were never going to appear in a Stripe export anyway. Always a fallback.
  let createdAtFallback = 0;
  let failed = 0;
  for (const o of withoutPi) {
    try {
      await fallBackToCreatedAt(o.id, o.createdAt);
      createdAtFallback += 1;
    } catch (e) {
      failed += 1;
      console.error("[backfillOrderPaidAt] no-PI fallback write failed", o.id, e);
    }
  }

  let stripeAuthoritative = 0;
  for (const batch of chunk(withPi, BACKFILL_CONCURRENCY)) {
    const results = await Promise.allSettled(
      batch.map(async (o): Promise<"stripe_authoritative" | "created_at_fallback"> => {
        const snap = await persistOrderStripeChargeLedger({
          orderId: o.id,
          paymentIntentId: o.stripePaymentIntentId,
          force: false,
        });
        if (snap?.paidAt) {
          // persistOrderStripeChargeLedger already wrote paidAt + paidAtSource="stripe_authoritative".
          return "stripe_authoritative";
        }
        // Stripe fetch failed, or this PI genuinely has no completed charge yet — fall back to
        // createdAt rather than leaving paidAt permanently null (which would silently exclude the
        // order from every financial reconciliation window forever).
        await fallBackToCreatedAt(o.id, o.createdAt);
        return "created_at_fallback";
      }),
    );
    for (let i = 0; i < results.length; i += 1) {
      const result = results[i];
      if (result.status === "fulfilled") {
        if (result.value === "stripe_authoritative") stripeAuthoritative += 1;
        else createdAtFallback += 1;
      } else {
        failed += 1;
        console.error("[backfillOrderPaidAt]", batch[i]?.id, result.reason);
      }
    }
  }

  return {
    candidatesInBatch: candidates.length,
    stripeAuthoritative,
    createdAtFallback,
    failed,
    mayHaveMore: candidates.length >= limit,
  };
}

/** Run to completion (bounded number of batches) — for scripts/one-off admin triggers. */
export async function backfillOrderPaidAtAll(opts?: {
  batchLimit?: number;
  maxBatches?: number;
}): Promise<{ batches: number; totals: PaidAtBackfillResult }> {
  const maxBatches = Math.max(1, opts?.maxBatches ?? 200);
  const totals: PaidAtBackfillResult = {
    candidatesInBatch: 0,
    stripeAuthoritative: 0,
    createdAtFallback: 0,
    failed: 0,
    mayHaveMore: false,
  };
  let batches = 0;
  for (; batches < maxBatches; batches += 1) {
    const result = await backfillOrderPaidAtBatch({ limit: opts?.batchLimit });
    totals.candidatesInBatch += result.candidatesInBatch;
    totals.stripeAuthoritative += result.stripeAuthoritative;
    totals.createdAtFallback += result.createdAtFallback;
    totals.failed += result.failed;
    if (!result.mayHaveMore) break;
  }
  return { batches, totals };
}
