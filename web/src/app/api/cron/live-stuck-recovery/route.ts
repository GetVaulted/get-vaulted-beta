import { NextResponse } from "next/server";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";
import { recoverStuckLiveRooms } from "@/lib/live-stuck-recovery-service";

/**
 * Zombie-live recovery cron. Detects rooms still flagged `live` whose host WebRTC publisher has
 * dropped and never returned (nobody publishing on the Stage), then nudges and eventually auto-ends
 * the abandoned show so viewers stop seeing a permanently-broken "live" and the HLS heal loop stops
 * spinning uselessly. Recommended schedule: every 60s. Protect with CRON_SECRET.
 *
 * Kill switches: LIVE_STUCK_RECOVERY_ENABLED=false disables it entirely;
 * LIVE_STUCK_AUTO_END_ENABLED=false runs in warn-only mode (never auto-ends).
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
    const result = await recoverStuckLiveRooms();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    reportCronAnomaly("live-stuck-recovery", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Stuck-live recovery sweep failed" }, { status: 500 });
  }
}
