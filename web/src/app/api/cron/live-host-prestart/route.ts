import { NextResponse } from "next/server";
import { notifyHostsLiveShowStartingSoon } from "@/lib/live-host-prestart-notify";
import {
  autoCancelNoShowScheduledShows,
  notifyHostsGoLiveNow,
  notifyHostsShowStartingT30,
  notifyHostsShowStartingT5,
} from "@/lib/live-host-show-reminders";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";

/**
 * Frequent cron: the full scheduled-show host reminder lineup (T−30, T−15, T−5, "go live now"),
 * plus the no-show auto-cancel (ends a scheduled show — and lets the seller start a new one — if
 * it never went live within an hour of `scheduledStartAt`).
 *
 * All five run off this single tick rather than separate cron entries, since this endpoint is
 * already wired up externally on a 5-minute schedule. Protect with CRON_SECRET.
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

  const now = new Date();
  const results: Record<string, unknown> = {};
  let anyFailed = false;

  const steps: Array<[string, () => Promise<unknown>]> = [
    ["t30", () => notifyHostsShowStartingT30(now)],
    ["t15", () => notifyHostsLiveShowStartingSoon(now)],
    ["t5", () => notifyHostsShowStartingT5(now)],
    ["goLive", () => notifyHostsGoLiveNow(now)],
    ["autoCancel", () => autoCancelNoShowScheduledShows(now)],
  ];

  for (const [key, run] of steps) {
    try {
      results[key] = await run();
    } catch (e) {
      anyFailed = true;
      results[key] = { error: e instanceof Error ? e.message : String(e) };
      reportCronAnomaly(`live-host-prestart:${key}`, e instanceof Error ? e.message : String(e));
    }
  }

  if (anyFailed) {
    return NextResponse.json({ ok: false, ...results }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...results });
}
