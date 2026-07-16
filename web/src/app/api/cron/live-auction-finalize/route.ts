import { NextResponse } from "next/server";
import { finalizeOverdueLiveAuctionLotsAcrossLiveRooms } from "@/lib/live-auction-finalize";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";

/**
 * Frequent cron: close overdue live auction timers across all live rooms.
 *
 * Buyer GET + finalize-overdue nudges already settle rooms with active viewers. This job covers
 * the empty-room / backgrounded-app case so break/PYT wins still charge when nobody is polling.
 * Protect with CRON_SECRET. Recommended schedule: every minute.
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
    const result = await finalizeOverdueLiveAuctionLotsAcrossLiveRooms();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    reportCronAnomaly("live-auction-finalize", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Live auction finalize sweep failed" }, { status: 500 });
  }
}
