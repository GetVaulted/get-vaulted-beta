import { NextResponse } from "next/server";
import { recalculateAllSellerPayoutTiers } from "@/services/payout/recalculate-seller-payout-tier";

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
  return NextResponse.json({ ok: true, ...result });
}
