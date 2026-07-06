import { NextResponse } from "next/server";
import { reconcileStripeWithDatabase } from "@/services/stripe-reconciliation";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";

/**
 * Stripe <-> DB reconciliation cron (chaos engineering deep-dive, 2026-07). Recommended schedule:
 * every 15 minutes. Idempotent and safe to rerun/overlap — see `reconcileStripeWithDatabase` for
 * why every write path this can trigger is guarded against duplicate processing. Protect with
 * CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    }
  } else {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const report = await reconcileStripeWithDatabase();
    if (report.errors.length > 0) {
      reportCronAnomaly("stripe-reconcile", `${report.errors.length} error(s) during reconciliation run`);
    }
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    reportCronAnomaly("stripe-reconcile", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Stripe reconciliation failed" }, { status: 500 });
  }
}
