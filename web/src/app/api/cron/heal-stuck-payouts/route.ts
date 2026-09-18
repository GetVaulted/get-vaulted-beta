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

  const result = await healStuckBankPayoutEvaluations(1000);

  if (result.errored > 0) {
    reportCronAnomaly(
      "heal-stuck-payouts",
      `${result.errored} of ${result.candidates} stuck orders errored during re-evaluation`,
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
