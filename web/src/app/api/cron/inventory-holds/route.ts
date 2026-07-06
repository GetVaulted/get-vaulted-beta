import { NextResponse } from "next/server";
import { expireStaleLiveAuctionInventoryHolds } from "@/lib/live-auction-inventory-hold";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";

/**
 * Frequent cron: sweep expired checkout/live-item inventory holds.
 *
 * `reserveListingInventoryHoldTx`/`reserveHostLiveItemInventoryHoldTx` self-heal against stale
 * holds on the next reservation attempt, so a missed run of this job cannot permanently block a
 * listing. This job exists to keep `LiveAuctionInventoryHold.status` accurate in the DB for
 * admin/reporting queries even when nobody happens to retry a hold on that listing/item.
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
    const expired = await expireStaleLiveAuctionInventoryHolds();
    return NextResponse.json({ ok: true, expired });
  } catch (e) {
    reportCronAnomaly("inventory-holds", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Inventory hold sweep failed" }, { status: 500 });
  }
}
