import { NextResponse } from "next/server";
import { loadAttentionItems } from "@/lib/admin/admin-attention";
import { notifyAdmins } from "@/lib/admin/notify-admins";

export const runtime = "nodejs";

/**
 * Pushes critical admin issues (blocked payouts, stuck refunds, disputes due, live show with no video)
 * to every admin. Each issue is sent at most once per 6-hour block (dedupe key), so running this
 * hourly never spams. Schedule hourly in the same external scheduler as the other crons. Protect with CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    }
  } else if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const block = `${now.toISOString().slice(0, 10)}-${Math.floor(now.getUTCHours() / 6)}`;
  const items = (await loadAttentionItems(now)).filter((i) => i.severity === "critical");
  let sent = 0;
  for (const i of items) {
    const r = await notifyAdmins({
      type: "admin_attention",
      title: `${i.count} · ${i.title}`,
      body: i.detail,
      href: i.href,
      dedupeKey: `attn:${i.key}:${block}`,
    });
    if (!r.skipped) sent += 1;
  }
  return NextResponse.json({ ok: true, critical: items.length, sent });
}
