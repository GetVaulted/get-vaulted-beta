import Link from "next/link";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";
import {
  isLiveRiskOrder,
  loadBuyerRiskWatch,
  RISK_FLAG_LABEL,
  RISK_MIN_ORDER_USD,
  RISK_NEW_ACCOUNT_DAYS,
} from "@/lib/admin/buyer-risk-watch";

export const dynamic = "force-dynamic";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function when(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function AdminRiskWatchPage() {
  const buyers = await loadBuyerRiskWatch({ days: 30 });

  return (
    <AdminCommandShell
      title="Risk watch"
      subtitle={`Buyers placing ${usd(RISK_MIN_ORDER_USD)}+ orders on accounts under ${RISK_NEW_ACCOUNT_DAYS} days old, or sharing a ship-to address with another account. Last 30 days.`}
    >
      {buyers.length === 0 ? (
        <div className={`${adminPanelClassName} p-6 text-sm text-zinc-300`}>Nothing flagged in the last 30 days.</div>
      ) : (
        <div className="space-y-4">
          {buyers.map((b) => (
            <section key={b.buyerId} className={`${adminPanelClassName} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/admin/users-management?q=${encodeURIComponent(b.username)}`} className="text-base font-bold text-foreground hover:underline">
                    {b.username}
                  </Link>
                  <p className="mt-1 text-xs text-zinc-500">
                    {b.email ?? "no email"} · account created {when(b.accountCreatedAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {b.flags.map((f) => (
                      <span key={f} className="rounded-full border border-amber-400/40 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                        {RISK_FLAG_LABEL[f]}
                      </span>
                    ))}
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-4 text-right text-xs tabular-nums">
                  <div>
                    <dt className="text-zinc-500">Paid</dt>
                    <dd className="text-sm font-bold text-foreground">{usd(b.paidUsd)}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Already shipped</dt>
                    <dd className={`text-sm font-bold ${b.shippedUsd > 0 ? "text-red-300" : "text-foreground"}`}>{usd(b.shippedUsd)}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Unpaid open</dt>
                    <dd className="text-sm font-bold text-foreground">{usd(b.openUsd)}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="text-zinc-500">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Placed</th>
                      <th className="py-1 pr-3 font-medium">Item</th>
                      <th className="py-1 pr-3 font-medium">Seller</th>
                      <th className="py-1 pr-3 text-right font-medium">Amount</th>
                      <th className="py-1 pr-3 font-medium">Payment</th>
                      <th className="py-1 pr-3 font-medium">Status</th>
                      <th className="py-1 font-medium">Ship to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.orders.map((o) => (
                      <tr key={o.id} className={`border-t border-white/5 ${isLiveRiskOrder(o) ? "" : "opacity-50"}`}>
                        <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-400">{when(o.createdAt)}</td>
                        <td className="py-1.5 pr-3 text-foreground">
                          <Link href={`/admin/orders?q=${encodeURIComponent(o.id)}`} className="hover:underline">
                            {o.title}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-3 text-zinc-300">{o.sellerUsername}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">{usd(o.itemPriceUsd)}</td>
                        <td className="py-1.5 pr-3 text-zinc-300">{o.paymentStatus.replace("_", " ")}</td>
                        <td className={`py-1.5 pr-3 ${o.status === "shipped" && o.paymentStatus === "paid" ? "font-semibold text-red-300" : "text-zinc-300"}`}>{o.status}</td>
                        <td className="py-1.5 text-zinc-400">{o.shipTo || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </AdminCommandShell>
  );
}
