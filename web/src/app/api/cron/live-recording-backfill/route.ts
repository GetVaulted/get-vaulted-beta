import { NextResponse } from "next/server";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";
import { backfillStuckReplaysFromS3 } from "@/lib/trust/live-replay-backfill";

/**
 * One-off (or occasional) recovery for `LiveStreamReplay` rows stuck pending/recording because the
 * "Recording End" EventBridge event never reached us (the Sep 2026 DEAUTHORIZED-connection outage
 * is the reason this route exists). Safe to call manually via `curl` with CRON_SECRET, or wire up
 * to a low-frequency schedule (e.g. hourly) as a standing safety net — it only touches rows still
 * stuck, so repeat calls are idempotent. Processes at most `limit` rows per call (default 50) to
 * keep each request well inside a serverless timeout; call again to keep draining the backlog.
 *
 * Pass `?dryRun=true` to see what the sweep *would* do (matches / expirations / misses, with a
 * per-replay breakdown in `details`) without writing anything to the DB — use this to check a
 * small batch (e.g. `?limit=10&dryRun=true`) before running for real against the full backlog.
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

  let limit = 50;
  let dryRun = false;
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("limit");
    if (raw) {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0) limit = Math.min(n, 200);
    }
    dryRun = url.searchParams.get("dryRun")?.trim().toLowerCase() === "true";
  } catch {
    /** Keep defaults on a malformed URL. */
  }

  try {
    const result = await backfillStuckReplaysFromS3(limit, { dryRun });
    if (result.errors > 0) {
      reportCronAnomaly("live-recording-backfill", `${result.errors} replay(s) failed to backfill this pass`);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    reportCronAnomaly("live-recording-backfill", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Replay backfill sweep failed" }, { status: 500 });
  }
}
