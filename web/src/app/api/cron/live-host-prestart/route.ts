import { NextResponse } from "next/server";
import { notifyHostsLiveShowStartingSoon } from "@/lib/live-host-prestart-notify";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";

/**
 * Frequent cron: hype push to hosts ~15 minutes before scheduledStartAt.
 * Protect with CRON_SECRET. Recommended schedule: every 5 minutes.
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
    const result = await notifyHostsLiveShowStartingSoon();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    reportCronAnomaly("live-host-prestart", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Live host prestart notify failed" }, { status: 500 });
  }
}
