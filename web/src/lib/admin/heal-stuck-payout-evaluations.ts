import { prisma } from "@/lib/prisma";
import { processShippedPayoutEvaluation } from "@/services/payout/process-payout-tier-events";
import { reportUrgentPaymentAnomaly } from "@/lib/cron-anomaly-alert";

export type HealStuckPayoutsResult = {
  candidates: number;
  healed: number;
  healedUsd: number;
  stillStuck: number;
  errored: number;
  errors: { orderId: string; message: string }[];
};

/**
 * Safety net for orders whose own shipped signals already say "shipped" (the same criteria
 * `orderLooksShippedForBankPayout` / the ready-for-bank-payout queue use) but whose payoutStatus
 * never advanced off "held".
 *
 * That state should be unreachable by design — `processShippedPayoutEvaluation` is supposed to
 * run and flip payoutStatus the moment an order looks shipped — but that evaluation runs as an
 * unguarded fire-and-forget call from three separate trigger points (seller marks shipped, the
 * Shippo webhook's carrier-acceptance scan, delivery confirmation) with no retry and, until this
 * function existed, no error visibility. A dropped promise, a race between concurrent
 * live-shipping-session siblings being marked shipped at nearly the same moment, or any thrown
 * exception silently strands the order in "held" forever even though it was already paid for in
 * Stripe/PayPal — and the admin Bank/PayPal Payouts screens only ever show orders once they reach
 * a "ready" payoutStatus, so a stranded order just vanishes from what an admin sees vs. what
 * Stripe/PayPal show as captured (audit 2026-09-18: 474 orders / $17,670.53 found stuck this way).
 *
 * This re-runs the exact same evaluation against any order that currently qualifies by ground
 * truth order data, so a missed evaluation gets corrected instead of vanishing. It never moves
 * money itself — `processShippedPayoutEvaluation` only ever updates `payoutStatus` (and, for the
 * PayPal rail, triggers that rail's own existing release path); an admin still separately chooses
 * to push a Stripe bank payout from the Bank Payouts screen.
 */
export async function healStuckBankPayoutEvaluations(limit = 500): Promise<HealStuckPayoutsResult> {
  const candidates = await prisma.order.findMany({
    where: {
      paymentStatus: "paid",
      payoutStatus: "held",
      OR: [
        { shippedAt: { not: null } },
        { carrierAcceptedAt: { not: null } },
        { fulfillmentStatus: { in: ["shipped", "in_transit", "out_for_delivery", "delivered"] } },
        { status: { in: ["shipped", "delivered"] } },
      ],
    },
    select: { id: true, totalUsd: true },
    orderBy: { createdAt: "asc" },
    take: Math.min(1000, Math.max(1, limit)),
  });

  let healed = 0;
  let healedUsd = 0;
  let stillStuck = 0;
  let errored = 0;
  const errors: { orderId: string; message: string }[] = [];

  for (const candidate of candidates) {
    try {
      await processShippedPayoutEvaluation(candidate.id);
    } catch (e) {
      errored += 1;
      const message = e instanceof Error ? e.message : "unknown_error";
      errors.push({ orderId: candidate.id, message });
      reportUrgentPaymentAnomaly(
        "heal_stuck_payout_evaluation",
        `order=${candidate.id} re-evaluation threw error=${message.slice(0, 200)}`,
      );
      continue;
    }

    const after = await prisma.order.findUnique({
      where: { id: candidate.id },
      select: { payoutStatus: true },
    });
    if (after && after.payoutStatus !== "held") {
      healed += 1;
      healedUsd += candidate.totalUsd;
    } else {
      // Legitimately still not ready (e.g. a live-shipping-session sibling genuinely hasn't
      // shipped yet, or label-cost clawback hasn't settled) — not an error, just not due yet.
      stillStuck += 1;
    }
  }

  return {
    candidates: candidates.length,
    healed,
    healedUsd: Math.round(healedUsd * 100) / 100,
    stillStuck,
    errored,
    errors: errors.slice(0, 20),
  };
}
