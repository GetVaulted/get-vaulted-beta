import { NextResponse } from "next/server";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";
import { archivePendingWinClips } from "@/lib/trust/win-clip-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every few minutes: save permanent copies of new "Watch your win" clips. Idempotent. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    }
  } else if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await archivePendingWinClips(8);
    if (result.errors > 0) {
      reportCronAnomaly("win-clip-archive", `${result.errors} clip(s) failed to save this pass`);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    reportCronAnomaly("win-clip-archive", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Win clip archive failed" }, { status: 500 });
  }
}
