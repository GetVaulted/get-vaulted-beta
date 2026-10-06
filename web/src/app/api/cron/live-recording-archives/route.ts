import { NextResponse } from "next/server";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";
import { reconcilePreparingReplayArchives } from "@/lib/trust/live-recording-s3";

/**
 * Finish IVS recording ZIP archives stuck in `preparing`.
 * Recommended schedule: every 2–5 minutes. Protect with CRON_SECRET.
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
    const result = await reconcilePreparingReplayArchives(3);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    reportCronAnomaly("live-recording-archives", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Live recording archive reconcile failed" }, { status: 500 });
  }
}
