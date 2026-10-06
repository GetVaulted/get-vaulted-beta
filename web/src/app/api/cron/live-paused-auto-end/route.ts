import { NextResponse } from "next/server";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";
import { endLongPausedLiveRooms } from "@/lib/live-paused-auto-end";

/**
 * Safety net: ends any live show whose video has been paused for 60 minutes or longer (default;
 * LIVE_PAUSED_AUTO_END_MINUTES overrides). Runs every 5 minutes via the Netlify scheduled function.
 * Protect with CRON_SECRET. Kill switch: LIVE_PAUSED_AUTO_END_ENABLED=false.
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
    const result = await endLongPausedLiveRooms();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    reportCronAnomaly("live-paused-auto-end", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Paused-show auto-end sweep failed" }, { status: 500 });
  }
}
