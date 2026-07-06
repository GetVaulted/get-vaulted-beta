import { NextResponse } from "next/server";
import { processLayawayMaintenance } from "@/services/layaway";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";

/** Cron hook: defaults overdue layaways and sends buyer reminders. Protect with CRON_SECRET in production. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Fail closed in production: an unset secret must never mean "no auth required".
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    }
  } else {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await processLayawayMaintenance();

  // Per-item failures are individually swallowed (one bad layaway shouldn't block the rest),
  // which also means a systemic failure would silently process 0 with an HTTP 200 and no
  // Sentry event (performance audit 2026-07: no completion/failure alerting existed).
  if (result.defaultFailures > 0) {
    reportCronAnomaly(
      "layaway-maintenance",
      `${result.defaultFailures} of ${result.overdueCandidates} overdue layaways failed to default`,
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
