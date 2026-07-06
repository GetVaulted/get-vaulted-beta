import { NextResponse } from "next/server";
import { reportStalledAuctionLotsToAdmin } from "@/lib/live-auction-stalled-lots";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";

/**
 * Auction integrity cron (chaos engineering deep-dive, 2026-07). Pure `roomType: "auction"` lots
 * intentionally never auto-settle on timer (host must mark sold) — this job only adds visibility
 * for lots that have been stuck pending a host action for an unusually long time. It never touches
 * bidding/order state, so it cannot change an auction outcome. Recommended schedule: hourly.
 * Protect with CRON_SECRET.
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
    const result = await reportStalledAuctionLotsToAdmin();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    reportCronAnomaly("live-auction-stall", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Auction integrity sweep failed" }, { status: 500 });
  }
}
