import { NextResponse } from "next/server";
import { reportCronAnomaly } from "@/lib/cron-anomaly-alert";
import { purgeExpiredDeletedThreads } from "@/lib/message-thread-cleanup";
import { prisma } from "@/lib/prisma";

/**
 * Daily Messages cleanup: removes deleted conversations for good once they pass the 14-day window,
 * and physically removes a conversation once both people have deleted it for good. Protect with
 * CRON_SECRET. Kill switch: MESSAGE_CLEANUP_ENABLED=false.
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

  if (process.env.MESSAGE_CLEANUP_ENABLED?.trim().toLowerCase() === "false") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const result = await purgeExpiredDeletedThreads(prisma);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    reportCronAnomaly("message-cleanup", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Message cleanup failed" }, { status: 500 });
  }
}
