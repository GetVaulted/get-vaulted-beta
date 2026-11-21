import Link from "next/link";
import { AdminCommandShell, adminPanelClassName } from "@/components/admin/AdminCommandShell";
import { MarkCreditCompensatedForm } from "@/components/admin/MarkCreditCompensatedForm";
import {
  CREDIT_COMP_STATUS_LABEL,
  loadCreditCompensation,
  type CreditCompStatus,
  type CreditKind,
} from "@/lib/admin/credit-compensation";

export const dynamic = "force-dynamic";

const DAY_CHOICES = [30, 90, 0] as const; // 0 = all time
const KIND_CHOICES: { value: CreditKind; label: string }[] = [
  { value: "all", label: "All credit" },
  { value: "platform", label: "Get Vaulted credit" },
  { value: "referral", label: "Referral credit" },
];

type SearchParams = { days?: string; kind?: string };

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cents(n: number): string {
  return usd(n / 100);
}

function when(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

const STATUS_PILL: Record<CreditCompStatus, string> = {
  owed: "border-rose-400/50 text-rose-300",
  failed: "border-rose-400/50 text-rose-300",
  compensated: "border-emerald-400/40 text-emerald-300",
  fee_covers: "border-white/15 text-zinc-400",
  not_applicable: "border-white/15 text-zinc-400",
};

export default async function AdminCreditCompensationPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const sp = (await searchParams) ?? {};
  const requestedDays = sp.days === undefined ? 30 : Number(sp.days);
  const days = (DAY_CHOICES as readonly number[]).includes(requestedDays) ? requestedDays : 30;
  const kind: CreditKind = KIND_CHOICES.some((k) => k.value === sp.kind) ? (sp.kind as CreditKind) : "all";

  const { rows, sellers, summary, truncated } = await loadCreditCompensation({
    kind,
    days: days === 0 ? null : days,
  });

  const href = (d: number, k: CreditKind) => `/admin/credit-compensation?days=${d}&kind=${k}`;
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold transition ${
      active ? "border-gold/50 bg-gold/15 text-gold-bright" : "border-white/10 text-zinc-400 hover:text-zinc-200"
    }`;

  return (
    <AdminCommandShell
      title="Credit compensation"
      subtitle="Orders where a buyer paid with Get Vaulted or referral credit. The seller is paid on the full sale price, but only the card amount reaches their Stripe balance, so any gap the platform fee does not absorb is owed to them. Amounts are estimates using the same formula as the old automatic top-up."
      actions={
        <>
          {DAY_CHOICES.map((d) => (
            <Link key={d} href={href(d, kind)} className={chip(d === days)}>
              {d === 0 ? "All time" : `${d} days`}
            </Link>
          ))}
          {KIND_CHOICES.map((k) => (
            <Link key={k.value} href={href(days, k.value)} className={chip(k.value === kind)}>
              {k.label}
            </Link>
          ))}
        </>
      }
    >
      <section className={`${adminPanelClassName} mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <p className="text-xs text-zinc-500">Still owed to sellers</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-rose-300">{cents(summary.owedCents)}</p>
          <p className="text-xs text-zinc-500">
            {summary.owedOrders} {summary.owedOrders === 1 ? "order" : "orders"}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Already paid back</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-300">{cents(summary.compensatedCents)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Get Vaulted credit spent</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{usd(summary.platformCreditUsd)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Referral credit spent</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{usd(summary.referralCreditUsd)}</p>
        </div>
      </section>

      {truncated ? (
        <div className={`${adminPanelClassName} mb-4 p-4 text-sm text-amber-300`}>
          Showing the newest 500 orders only. Pick a shorter window to see everything.
        </div>
      ) : null}

      {sellers.length > 0 ? (
        <section className={`${adminPanelClassName} mb-4 p-4`}>
          <h2 className="text-sm font-bold text-foreground">Owed by seller</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[360px] text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Seller</th>
                  <th className="py-1 pr-3 text-right font-medium">Orders</th>
                  <th className="py-1 text-right font-medium">Owed</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.sellerId} className="border-t border-white/5">
                    <td className="py-1.5 pr-3">
                      <Link
                        href={`/admin/users-management?q=${encodeURIComponent(s.seller)}`}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {s.seller}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-300">{s.orders}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums text-rose-300">{cents(s.owedCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <div className={`${adminPanelClassName} p-6 text-sm text-zinc-300`}>No orders paid with credit in this window.</div>
      ) : (
        <section className={`${adminPanelClassName} p-4`}>
          <h2 className="text-sm font-bold text-foreground">Orders</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Placed</th>
                  <th className="py-1 pr-3 font-medium">Seller</th>
                  <th className="py-1 pr-3 font-medium">Buyer</th>
                  <th className="py-1 pr-3 text-right font-medium">Credit used</th>
                  <th className="py-1 pr-3 text-right font-medium">Platform fee</th>
                  <th className="py-1 pr-3 text-right font-medium">Seller short</th>
                  <th className="py-1 pr-3 font-medium">Status</th>
                  <th className="py-1 font-medium">Payout</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const credit = r.platformCreditUsd + r.referralCreditUsd;
                  const needsAction = r.status === "owed" || r.status === "failed";
                  return (
                    <tr key={r.id} className="border-t border-white/5 align-top">
                      <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-400">
                        <Link href={`/admin/orders?q=${encodeURIComponent(r.id)}`} className="hover:underline">
                          {when(r.createdAt)}
                        </Link>
                        <p className="text-[11px] text-zinc-600">{r.live ? "Live show" : "Marketplace"}</p>
                      </td>
                      <td className="py-1.5 pr-3">
                        <Link
                          href={`/admin/users-management?q=${encodeURIComponent(r.seller)}`}
                          className="text-foreground hover:underline"
                        >
                          {r.seller}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3 text-zinc-300">{r.buyer}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                        {usd(credit)}
                        <p className="text-[11px] text-zinc-600">
                          {r.platformCreditUsd > 0 && r.referralCreditUsd > 0
                            ? "Get Vaulted + referral"
                            : r.platformCreditUsd > 0
                              ? "Get Vaulted"
                              : "Referral"}
                        </p>
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-300">{cents(r.platformFeeCents)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                        {r.status === "fee_covers" || r.status === "not_applicable" ? "—" : cents(r.shortfallCents)}
                      </td>
                      <td className="py-1.5 pr-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATUS_PILL[r.status]}`}
                        >
                          {CREDIT_COMP_STATUS_LABEL[r.status]}
                        </span>
                        {r.status === "compensated" && r.transferId ? (
                          <p className="mt-1 break-all text-[11px] text-zinc-500">
                            {r.transferId}
                            {r.fundedAt ? ` · ${when(r.fundedAt)}` : ""}
                          </p>
                        ) : null}
                        {needsAction ? (
                          <div className="mt-2">
                            <MarkCreditCompensatedForm orderId={r.id} amountLabel={cents(r.shortfallCents)} />
                          </div>
                        ) : null}
                      </td>
                      <td className="py-1.5 text-zinc-300">
                        {r.payoutStatus.replace(/_/g, " ")}
                        {r.payoutBlockedReason ? (
                          <p className="mt-0.5 max-w-[220px] break-words text-[11px] text-amber-300">
                            {r.payoutBlockedReason}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AdminCommandShell>
  );
}
