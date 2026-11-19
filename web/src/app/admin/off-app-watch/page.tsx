import Link from "next/link";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";
import {
  loadOffAppWatch,
  OFF_APP_LEVEL_LABEL,
  OFF_APP_TAG_LABEL,
  type OffAppLevel,
} from "@/lib/admin/off-app-watch";

export const dynamic = "force-dynamic";

const DAY_CHOICES = [7, 30, 90] as const;

type SearchParams = { days?: string; low?: string };

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function when(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

const LEVEL_PILL: Record<OffAppLevel, string> = {
  high: "border-rose-400/50 text-rose-300",
  medium: "border-amber-400/40 text-amber-300",
  low: "border-white/15 text-zinc-400",
};

export default async function AdminOffAppWatchPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const sp = (await searchParams) ?? {};
  const requested = Number(sp.days);
  const days = (DAY_CHOICES as readonly number[]).includes(requested) ? requested : 30;
  const includeLow = sp.low === "1";
  const { threads, scanned, truncated } = await loadOffAppWatch({ days, includeLow });

  const href = (d: number, low: boolean) => `/admin/off-app-watch?days=${d}${low ? "&low=1" : ""}`;
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold transition ${
      active ? "border-gold/50 bg-gold/15 text-gold-bright" : "border-white/10 text-zinc-400 hover:text-zinc-200"
    }`;

  return (
    <AdminCommandShell
      title="Off-app watch"
      subtitle={`DMs that look like a sale moving to Zelle, Venmo, Cash App or a phone number, with a check for a real app order between the same two people. Scanned ${scanned.toLocaleString("en-US")} messages from the last ${days} days. Messages sent by admin accounts are skipped.`}
      actions={
        <>
          {DAY_CHOICES.map((d) => (
            <Link key={d} href={href(d, includeLow)} className={chip(d === days)}>
              {d} days
            </Link>
          ))}
          <Link href={href(days, !includeLow)} className={chip(includeLow)}>
            {includeLow ? "Hide contact swaps" : "Show contact swaps"}
          </Link>
        </>
      }
    >
      {truncated ? (
        <div className={`${adminPanelClassName} mb-4 p-4 text-sm text-amber-300`}>
          Only the newest 10,000 messages were scanned. Pick a shorter window to cover everything.
        </div>
      ) : null}

      {threads.length === 0 ? (
        <div className={`${adminPanelClassName} p-6 text-sm text-zinc-300`}>Nothing flagged in the last {days} days.</div>
      ) : (
        <div className="space-y-4">
          {threads.map((t) => {
            const noOrder = t.orders.length === 0;
            return (
              <section key={t.threadId} className={`${adminPanelClassName} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LEVEL_PILL[t.level]}`}>
                        {OFF_APP_LEVEL_LABEL[t.level]}
                      </span>
                      <Link
                        href={`/admin/users-management?q=${encodeURIComponent(t.users[0])}`}
                        className="text-base font-bold text-foreground hover:underline"
                      >
                        {t.users[0]}
                      </Link>
                      <span className="text-zinc-500">and</span>
                      <Link
                        href={`/admin/users-management?q=${encodeURIComponent(t.users[1])}`}
                        className="text-base font-bold text-foreground hover:underline"
                      >
                        {t.users[1]}
                      </Link>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {t.flaggedCount} flagged {t.flaggedCount === 1 ? "message" : "messages"} · {when(t.firstFlaggedAt)}
                      {t.lastFlaggedAt.getTime() !== t.firstFlaggedAt.getTime() ? ` to ${when(t.lastFlaggedAt)}` : ""}
                      {t.amounts.length ? ` · mentioned ${t.amounts.join(", ")}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {t.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-zinc-300">
                          {OFF_APP_TAG_LABEL[tag]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    {noOrder ? (
                      <span className="rounded-lg border border-rose-400/40 px-2 py-1 font-semibold text-rose-300">
                        No app order between them around then
                      </span>
                    ) : (
                      <span className="rounded-lg border border-emerald-400/30 px-2 py-1 font-semibold text-emerald-300">
                        {t.orders.length} app {t.orders.length === 1 ? "order" : "orders"} nearby
                      </span>
                    )}
                  </div>
                </div>

                <ol className="mt-3 space-y-1.5 text-xs">
                  {t.lines.map((l) => (
                    <li key={l.id}>
                      {l.gapBefore ? <p className="py-1 text-center text-zinc-600">…</p> : null}
                      <div
                        className={`rounded-lg px-3 py-2 ${
                          l.level ? "border border-white/10 bg-white/[0.04]" : "text-zinc-500"
                        }`}
                      >
                        <p className="text-[11px] text-zinc-500">
                          <span className="font-semibold text-zinc-300">{l.sender}</span> · {when(l.createdAt)}
                          {l.level ? (
                            <span className={`ml-2 rounded-full border px-1.5 py-px ${LEVEL_PILL[l.level]}`}>{l.level}</span>
                          ) : null}
                        </p>
                        <p className={`mt-0.5 whitespace-pre-wrap break-words ${l.level ? "text-foreground" : ""}`}>
                          {l.body || (l.hasImage ? "[photo]" : "")}
                          {l.body && l.hasImage ? " [photo]" : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>

                {t.orders.length > 0 ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-xs">
                      <thead className="text-zinc-500">
                        <tr>
                          <th className="py-1 pr-3 font-medium">Order placed</th>
                          <th className="py-1 pr-3 text-right font-medium">Item price</th>
                          <th className="py-1 pr-3 font-medium">Payment</th>
                          <th className="py-1 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.orders.map((o) => (
                          <tr key={o.id} className="border-t border-white/5">
                            <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-400">
                              <Link href={`/admin/orders?q=${encodeURIComponent(o.id)}`} className="hover:underline">
                                {when(o.createdAt)}
                              </Link>
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">{usd(o.itemPriceUsd)}</td>
                            <td className="py-1.5 pr-3 text-zinc-300">{o.paymentStatus.replace("_", " ")}</td>
                            <td className="py-1.5 text-zinc-300">{o.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </AdminCommandShell>
  );
}
