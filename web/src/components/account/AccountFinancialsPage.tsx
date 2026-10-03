"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";
import type { BuyerFinancialsSummary } from "@/lib/buyer-financials";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function channelLabel(channel: BuyerFinancialsSummary["activity"][number]["channel"]) {
  if (channel === "live") return "Live";
  if (channel === "layaway") return "Layaway";
  if (channel === "credit") return "Credit";
  return "Marketplace";
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        accent
          ? "border-gold/35 bg-gold/10"
          : "border-white/[0.08] bg-[#0a0a0d]/90"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className={`mt-1 font-display text-2xl font-black tabular-nums ${accent ? "text-gold-bright" : "text-zinc-100"}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function AccountFinancialsPage() {
  const { status } = useSession();
  const [data, setData] = useState<BuyerFinancialsSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
    const res = await fetch(`/api/account/financials?tz=${encodeURIComponent(tz)}`, { cache: "no-store" });
    if (!res.ok) {
      setData(null);
      setLoadError(res.status === 401 ? "Please sign in again." : "Could not load financials. Try again.");
      return;
    }
    const json = (await res.json()) as { financials?: BuyerFinancialsSummary };
    setData(json.financials ?? null);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void load();
  }, [load, status]);

  if (status === "loading" || (status === "authenticated" && data === null && !loadError)) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(360px,50vh)] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.06),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-16 pt-5 sm:px-4 lg:px-10">
        <header className="border-b border-white/[0.07] pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Account</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Your financials
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            What you&apos;ve spent on Get Vaulted — marketplace, live breaks, open balances, and credits.
          </p>
          <div className="mt-4">
            <AccountOrdersNav active="financials" mode="buyer" />
          </div>
        </header>

        {loadError ? (
          <div className="mt-8 rounded-2xl border border-rose-500/25 bg-rose-950/25 px-6 py-10 text-center">
            <p className="text-sm font-medium text-rose-100">{loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-rose-300/30 px-6 text-xs font-bold uppercase tracking-wide text-rose-50 transition hover:bg-rose-500/10"
            >
              Retry
            </button>
          </div>
        ) : data ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Lifetime spent" value={formatMoney(data.lifetimeSpentUsd)} accent hint={`${data.paidOrderCount} paid purchases`} />
              <StatCard label={data.monthLabel} value={formatMoney(data.monthSpentUsd)} hint="This month" />
              <StatCard label="Today" value={formatMoney(data.todaySpentUsd)} />
              <StatCard
                label="Open balance"
                value={formatMoney(data.openBalanceUsd)}
                hint={
                  data.openBalanceUsd > 0
                    ? `${formatMoney(data.pendingPaymentUsd)} pending · ${formatMoney(data.layawayRemainingUsd)} layaway`
                    : "Nothing due"
                }
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Marketplace" value={formatMoney(data.marketplaceSpentUsd)} />
              <StatCard label="Live shows" value={formatMoney(data.liveSpentUsd)} />
              <StatCard
                label="Referral credit"
                value={formatMoney(data.referralCreditUsd)}
                hint={
                  data.referralCreditPendingUsd > 0
                    ? `${formatMoney(data.referralCreditPendingUsd)} pending`
                    : "Available at checkout"
                }
              />
              <StatCard
                label="Get Vaulted Credit"
                value={formatMoney(data.vaultCreditsUsd)}
                hint="Store credit · not withdrawable"
              />
              <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0d]/90 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Quick links</p>
                <div className="mt-2 flex flex-col gap-1.5 text-sm">
                  <Link href="/account/orders" className="font-semibold text-gold-bright/90 hover:underline">
                    Orders
                  </Link>
                  <Link href="/account/orders?view=live" className="font-semibold text-gold-bright/90 hover:underline">
                    Live purchases
                  </Link>
                  <Link href="/account/layaways" className="font-semibold text-gold-bright/90 hover:underline">
                    Layaways
                  </Link>
                  <Link href="/account/payment-methods" className="font-semibold text-gold-bright/90 hover:underline">
                    Wallet & shipping
                  </Link>
                </div>
              </div>
            </div>

            <section className="mt-8">
              <div className="flex flex-wrap items-end justify-between gap-2 border-b border-white/[0.07] pb-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Activity</p>
                  <h2 className="font-display text-lg font-black text-foreground">Recent money movement</h2>
                </div>
              </div>

              {data.activity.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-14 text-center">
                  <p className="font-display text-lg font-semibold text-foreground">No purchases yet</p>
                  <p className="mt-2 text-sm text-zinc-500">
                    When you buy on marketplace or in a live break, your spend shows up here.
                  </p>
                  <Link
                    href="/marketplace"
                    className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950"
                  >
                    Browse marketplace
                  </Link>
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-[#08080a]">
                  {data.activity.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={row.href}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/[0.02]"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-100">{row.title}</p>
                          <p className="mt-0.5 text-[11px] text-zinc-500">
                            {channelLabel(row.channel)} · {row.subtitle} · {formatWhen(row.occurredAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-mono text-sm font-semibold tabular-nums ${
                              row.channel === "layaway" ? "text-amber-200" : "text-zinc-100"
                            }`}
                          >
                            {row.channel === "layaway" ? "Due " : ""}
                            {formatMoney(row.amountUsd)}
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{row.statusLabel}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
