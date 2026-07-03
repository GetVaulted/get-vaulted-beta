import { NextResponse } from "next/server";
import { processLayawayMaintenance } from "@/services/layaway";

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

  await processLayawayMaintenance();
  return NextResponse.json({ ok: true });
}
