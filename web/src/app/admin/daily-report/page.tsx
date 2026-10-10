import Link from "next/link";
import { AdminCommandShell, adminPanelClassName, adminTableClassName } from "@/components/admin/AdminCommandShell";
import { loadDailyReport } from "@/lib/admin/admin-daily-report";

export const dynamic = "force-dynamic";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function AdminDailyReportPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const r = await loadDailyReport(days);
  return (
    <AdminCommandShell
      title="Daily report"
      subtitle="Sales, refunds and new members by day (UTC). Fees, tax and bank payouts are on Finance and Tax."
      actions={
        <a href={`/api/admin/daily-report?days=${days}&format=csv`} className="text-xs text-gold-bright hover:underline">
          Download CSV
        </a>
      }
    >
      <div className="mb-3 flex gap-3 text-xs">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/admin/daily-report?days=${d}`} className={d === days ? "text-gold-bright" : "text-zinc-500 hover:underline"}>
            {d} days
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        {[
          ["Paid orders", String(r.totals.orders)],
          ["Sales", usd(r.totals.gmvUsd)],
          ["Refund rate", `${r.totals.refundRatePct}%`],
          ["New members", String(r.totals.newMembers)],
        ].map(([k, v]) => (
          <div key={k} className={`${adminPanelClassName} p-3`}>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</p>
            <p className="mt-1 text-lg tabular-nums text-foreground">{v}</p>
          </div>
        ))}
      </div>
      {r.truncated ? <p className="mt-3 text-xs text-amber-300">Very large period: showing the newest 50,000 orders only.</p> : null}

      <div className={`${adminPanelClassName} mt-4 overflow-x-auto`}>
        <table className={adminTableClassName}>
          <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
            <tr><th>Day</th><th>Orders</th><th>Sales</th><th>Refunds</th><th>New members</th></tr>
          </thead>
          <tbody className="tabular-nums">
            {[...r.days].reverse().map((d) => (
              <tr key={d.day} className="border-t border-white/[0.05]">
                <td>{d.day}</td><td>{d.orders}</td><td>{usd(d.gmvUsd)}</td><td>{d.refunds}</td><td>{d.newMembers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`${adminPanelClassName} mt-4 overflow-x-auto`}>
        <table className={adminTableClassName}>
          <caption className="p-3 text-left text-[10px] uppercase tracking-wide text-zinc-500">Top sellers in this period</caption>
          <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
            <tr><th>Seller</th><th>Orders</th><th>Sales</th></tr>
          </thead>
          <tbody className="tabular-nums">
            {r.topSellers.map((s) => (
              <tr key={s.sellerId} className="border-t border-white/[0.05]">
                <td><Link href={`/admin/users/${s.sellerId}`} className="text-gold-bright hover:underline">@{s.username}</Link></td>
                <td>{s.orders}</td><td>{usd(s.gmvUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminCommandShell>
  );
}
