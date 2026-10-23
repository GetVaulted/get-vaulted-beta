import { NextResponse } from "next/server";
import { loadBuyerRiskWatch, isLiveRiskOrder, RISK_FLAG_LABEL } from "@/lib/admin/buyer-risk-watch";
import { notifyAdmins } from "@/lib/admin/notify-admins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/**
 * Every few minutes: alert admins to risky buyer activity (new account placing a big order, or the
 * same ship-to address on several accounts). At most one summary per buyer per day, plus a separate
 * alert for each flagged order the moment it is paid. Failed / cancelled attempts never alert.
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
  const day = now.toISOString().slice(0, 10);
  const buyers = await loadBuyerRiskWatch({ days: 2, now });
  let sent = 0;

  for (const b of buyers) {
    const live = b.orders.filter(isLiveRiskOrder);
    if (live.length === 0) continue;

    const paid = live.filter((o) => o.paymentStatus === "paid");
    for (const o of paid) {
      const r = await notifyAdmins({
        type: "admin_risk_paid",
        title: `Risk: ${b.username} paid ${usd(o.itemPriceUsd)}`,
        body: `${o.title} from ${o.sellerUsername}. ${o.flags.map((f) => RISK_FLAG_LABEL[f]).join(" · ")}. Status: ${o.status}. Ship-to: ${o.shipTo || "unknown"}. Check before it ships.`,
        href: "/admin/risk-watch",
        dedupeKey: `risk:paid:${o.id}`,
      });
      if (!r.skipped) sent += 1;
    }

    const r = await notifyAdmins({
      type: "admin_risk_buyer",
      title: `Risk watch: ${b.username}`,
      body: `${live.length} flagged order${live.length === 1 ? "" : "s"} (${usd(live.reduce((s, o) => s + o.itemPriceUsd, 0))}) in the last 2 days. ${b.flags.map((f) => RISK_FLAG_LABEL[f]).join(" · ")}.`,
      href: "/admin/risk-watch",
      dedupeKey: `risk:buyer:${b.buyerId}:${day}`,
    });
    if (!r.skipped) sent += 1;
  }

  return NextResponse.json({ ok: true, flaggedBuyers: buyers.length, sent });
}
