import { NextResponse } from "next/server";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";
import { cleanupOrphanedIvsCompositions, closeStaleOpenLiveRooms } from "@/services/ivs";

/**
 * Orphaned-composition cleanup cron. A `StartComposition` bills ~$2.30/hr (channel input + HD
 * encode) for as long as AWS reports it ACTIVE, whether or not anyone is actually on the stage.
 * The normal show-end teardown and the stuck-live recovery sweep cover the common cases, but both
 * are DB-first; this sweep is AWS-first (ListCompositions) so it self-heals the cases those miss
 * entirely -- a crash mid-teardown, a `channel_hls`/OBS room the other sweep never looks at, or any
 * other DB/AWS drift. Recommended schedule: every 10 minutes. Protect with CRON_SECRET.
 *
 * Kill switch: LIVE_COMPOSITION_CLEANUP_ENABLED=false disables it entirely.
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

  if (process.env.LIVE_COMPOSITION_CLEANUP_ENABLED?.trim().toLowerCase() === "false") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const compositions = await cleanupOrphanedIvsCompositions();
    const staleRooms = await closeStaleOpenLiveRooms();
    if (compositions.errors > 0) {
      reportCronAnomaly(
        "live-composition-cleanup",
        `${compositions.errors} composition(s) failed to clean up this pass`,
      );
    }
    return NextResponse.json({ ok: true, compositions, staleRooms });
  } catch (e) {
    reportCronAnomaly("live-composition-cleanup", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Composition cleanup sweep failed" }, { status: 500 });
  }
}
