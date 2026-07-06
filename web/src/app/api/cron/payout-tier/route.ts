import { NextResponse } from "next/server";
import { recalculateAllSellerPayoutTiers } from "@/services/payout/recalculate-seller-payout-tier";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";

/** Daily cron: recalculate seller payout tier eligibility from metrics. Protect with CRON_SECRET. */
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

  const result = await recalculateAllSellerPayoutTiers();

  // A cron returning HTTP 200 tells you nothing if it silently did less work than expected —
  // Sentry only fires on thrown exceptions, not "processed 0 of 400 candidates" (performance
  // audit 2026-07: no completion/failure alerting existed for this job).
  if (result.candidates > 0 && result.processed === 0) {
    reportCronAnomaly("payout-tier", `processed 0 of ${result.candidates} candidate sellers`);
  } else if (result.failed > 0) {
    reportCronAnomaly("payout-tier", `${result.failed} of ${result.candidates} sellers failed recalculation`);
  }

  return NextResponse.json({ ok: true, ...result });
}
