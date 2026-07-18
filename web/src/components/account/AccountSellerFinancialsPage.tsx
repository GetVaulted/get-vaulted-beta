"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";
import type { SellerFinancialsSummary } from "@/lib/seller-financials";
import type { SellerWalletSummary } from "@/lib/stripe-connect-wallet-summary";

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
        accent ? "border-gold/35 bg-gold/10" : "border-white/[0.08] bg-[#0a0a0d]/90"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-black tabular-nums ${
          accent ? "text-gold-bright" : "text-zinc-100"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function AccountSellerFinancialsPage() {
  const { status } = useSession();
  const [data, setData] = useState<SellerFinancialsSummary | null>(null);
  const [wallet, setWallet] = useState<SellerWalletSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
    const [finRes, walletRes] = await Promise.all([
      fetch(`/api/account/seller-financials?tz=${encodeURIComponent(tz)}`, { cache: "no-store" }),
      fetch("/api/stripe/connect/wallet", { cache: "no-store" }),
    ]);

    if (!finRes.ok) {
      setData(null);
      setLoadError(finRes.status === 401 ? "Please sign in again." : "Could not load seller financials. Try again.");
      return;
    }
    const finJson = (await finRes.json()) as { financials?: SellerFinancialsSummary };
    setData(finJson.financials ?? null);

    if (walletRes.ok) {
      const w = (await walletRes.json()) as SellerWalletSummary;
      setWallet(w);
    } else {
      setWallet(null);
    }
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
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Seller</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Seller financials
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-zinc-500">
            Earnings, fees, payout status, and Stripe balance — marketplace and live sales in one place.
            {data?.feesAreMostlyEstimates
              ? " Fee lines use estimates when Stripe ledger amounts are not yet stored on an order."
              : " Fee lines prefer actual Stripe ledger amounts when available."}
          </p>
          <div className="mt-4">
            <AccountOrdersNav active="financials" mode="seller" />
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
            {wallet ? (
              <section className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200/70">
                      Stripe Connect wallet
                    </p>
                    <p className="mt-1 font-display text-3xl font-black text-emerald-100">
                      {wallet.hasStripeAccount ? wallet.availableFormatted : "—"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {wallet.hasStripeAccount
                        ? `Available to bank · Pending ${wallet.pendingFormatted}`
                        : "Connect payouts in Seller HQ to see Stripe balances."}
                    </p>
                    {wallet.nextPayoutLabel ? (
                      <p className="mt-1 text-xs text-zinc-500">Next payout: {wallet.nextPayoutLabel}</p>
                    ) : null}
                    {wallet.payoutScheduleSummary ? (
                      <p className="mt-0.5 text-[11px] text-zinc-600">{wallet.payoutScheduleSummary}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2 text-sm">
                    <Link
                      href="/account/seller"
                      className="font-semibold text-gold-bright/90 hover:underline"
                    >
                      Seller HQ / Connect
                    </Link>
                    <Link href="/account/sales" className="font-semibold text-gold-bright/90 hover:underline">
                      Open sales
                    </Link>
                  </div>
                </div>
              </section>
            ) : null}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Lifetime earnings"
                value={formatMoney(data.lifetimeEarningsUsd)}
                accent
                hint={`Est. seller net · ${data.paidOrderCount} paid sales`}
              />
              <StatCard
                label={data.monthLabel}
                value={formatMoney(data.monthEarningsUsd)}
                hint={`GMV ${formatMoney(data.monthGmvUsd)}`}
              />
              <StatCard
                label="Today"
                value={formatMoney(data.todayEarningsUsd)}
                hint={`GMV ${formatMoney(data.todayGmvUsd)}`}
              />
              <StatCard
                label="Pending payout"
                value={formatMoney(data.pendingPayoutUsd)}
                hint={
                  data.heldOrBlockedUsd > 0
                    ? `${formatMoney(data.heldOrBlockedUsd)} held / blocked / review`
                    : "Awaiting release to Stripe"
                }
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Lifetime GMV" value={formatMoney(data.lifetimeGmvUsd)} hint="Gross item sales" />
              <StatCard label="Marketplace net" value={formatMoney(data.marketplaceEarningsUsd)} />
              <StatCard label="Live shows net" value={formatMoney(data.liveEarningsUsd)} />
              <StatCard
                label="Paid out (orders)"
                value={formatMoney(data.paidOutUsd)}
                hint={
                  data.payoutTierLabel
                    ? `Payout tier: ${data.payoutTierLabel}`
                    : "Marked paid_out in Get Vaulted"
                }
              />
            </div>

            <section className="mt-6 grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0d]/90 px-4 py-4 lg:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Fee totals</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-zinc-500">Get Vaulted fees</p>
                    <p className="mt-0.5 font-mono text-lg font-semibold text-zinc-100">
                      {formatMoney(data.platformFeesUsd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Stripe processing</p>
                    <p className="mt-0.5 font-mono text-lg font-semibold text-zinc-100">
                      {formatMoney(data.stripeProcessingFeesUsd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Shipping labels</p>
                    <p className="mt-0.5 font-mono text-lg font-semibold text-zinc-100">
                      {formatMoney(data.labelCostsUsd)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-zinc-600">
                  Tax collected from buyers is remitted by Get Vaulted and is not part of your payout. Shipping charged
                  to the buyer is pass-through until a Get Vaulted label cost is deducted.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0d]/90 px-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Payout status</p>
                {data.payoutStatusBreakdown.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-500">No paid sales yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {data.payoutStatusBreakdown.map((b) => (
                      <li key={b.status} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-zinc-400">
                          {b.label}{" "}
                          <span className="text-zinc-600">({b.orderCount})</span>
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-zinc-100">
                          {formatMoney(b.sellerNetUsd)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="mt-8">
              <div className="border-b border-white/[0.07] pb-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Activity</p>
                <h2 className="font-display text-lg font-black text-foreground">Sale-by-sale breakdown</h2>
              </div>

              {data.activity.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-14 text-center">
                  <p className="font-display text-lg font-semibold text-foreground">No paid sales yet</p>
                  <p className="mt-2 text-sm text-zinc-500">
                    When buyers pay for marketplace or live orders, earnings and fees show up here.
                  </p>
                  <Link
                    href="/account/listings"
                    className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950"
                  >
                    Manage listings
                  </Link>
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-[#08080a]">
                  {data.activity.map((row) => {
                    const open = expandedId === row.id;
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => setExpandedId(open ? null : row.id)}
                          className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-zinc-100">{row.title}</p>
                            <p className="mt-0.5 text-[11px] text-zinc-500">
                              {row.channel === "live" ? "Live" : "Marketplace"}
                              {row.liveShowTitle ? ` · ${row.liveShowTitle}` : ""}
                              {" · "}@{row.buyerUsername}
                              {" · "}
                              {formatWhen(row.occurredAt)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-sm font-semibold tabular-nums text-gold-bright">
                              {formatMoney(row.sellerNetUsd)}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                              {row.payoutStatusLabel}
                            </p>
                          </div>
                        </button>
                        {open ? (
                          <div className="border-t border-white/[0.05] bg-black/30 px-4 py-3 text-xs text-zinc-400">
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                              <p>
                                Item{" "}
                                <span className="font-mono text-zinc-200">{formatMoney(row.itemPriceUsd)}</span>
                              </p>
                              <p>
                                Shipping{" "}
                                <span className="font-mono text-zinc-200">{formatMoney(row.shippingPriceUsd)}</span>
                              </p>
                              <p>
                                Tax (platform){" "}
                                <span className="font-mono text-zinc-200">{formatMoney(row.taxUsd)}</span>
                              </p>
                              <p>
                                Platform fee ({row.platformFeePercent}%){" "}
                                <span className="font-mono text-zinc-200">{formatMoney(row.platformFeeUsd)}</span>
                              </p>
                              <p>
                                Stripe processing{" "}
                                <span className="font-mono text-zinc-200">
                                  {formatMoney(row.stripeProcessingFeeUsd)}
                                </span>
                              </p>
                              <p>
                                Label cost{" "}
                                <span className="font-mono text-zinc-200">{formatMoney(row.labelCostUsd)}</span>
                              </p>
                              <p>
                                Reserve{" "}
                                <span className="font-mono text-zinc-200">{formatMoney(row.reserveUsd)}</span>
                              </p>
                              <p>
                                Your net{" "}
                                <span className="font-mono font-semibold text-gold-bright">
                                  {formatMoney(row.sellerNetUsd)}
                                </span>
                                {row.feesAreEstimates ? (
                                  <span className="ml-1 text-[10px] text-zinc-600">(est.)</span>
                                ) : null}
                              </p>
                            </div>
                            <Link
                              href={row.href}
                              className="mt-3 inline-block font-semibold text-gold-bright/90 hover:underline"
                            >
                              Open sale detail
                            </Link>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
