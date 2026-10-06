import { NextResponse } from "next/server";
import { healStuckBankPayoutEvaluations } from "@/lib/admin/heal-stuck-payout-evaluations";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";

export const runtime = "nodejs";

/**
 * Cron safety net: re-run payout-ready evaluation for any paid order stuck at payoutStatus "held"
 * despite already looking shipped (see heal-stuck-payout-evaluations.ts). Recommended schedule:
 * hourly, same cadence as the other payout-adjacent crons in this file's sibling routes. Wire this
 * up in whichever external scheduler already calls /api/cron/payout-tier and
 * /api/cron/stripe-reconcile. Protect with CRON_SECRET.
 *
 * Loops over several small time-budgeted batches (see healStuckBankPayoutEvaluations) within an
 * overall budget instead of one big batch, so a large backlog still gets drained across a single
 * invocation without ever risking the platform killing a single oversized synchronous call.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Fail closed in production: an unset secret must never mean "no auth required".
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    }
  } else {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const overallBudgetMs = 20000;
  const startedAt = Date.now();

  let candidates = 0;
  let healed = 0;
  let healedUsd = 0;
  let stillStuck = 0;
  let errored = 0;
  const errors: { orderId: string; message: string }[] = [];
  let hasMore = true;

  while (hasMore && Date.now() - startedAt < overallBudgetMs) {
    const batch = await healStuckBankPayoutEvaluations(1000, 7000);
    candidates += batch.candidates;
    healed += batch.healed;
    healedUsd += batch.healedUsd;
    stillStuck += batch.stillStuck;
    errored += batch.errored;
    errors.push(...batch.errors);
    hasMore = batch.hasMore;
    if (batch.candidates === 0) break;
  }

  const result = {
    candidates,
    healed,
    healedUsd: Math.round(healedUsd * 100) / 100,
    stillStuck,
    errored,
    errors: errors.slice(0, 20),
    hasMore,
  };

  if (result.errored > 0) {
    reportCronAnomaly(
      "heal-stuck-payouts",
      `${result.errored} of ${result.candidates} stuck orders errored during re-evaluation`,
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
