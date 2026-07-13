"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AccountLiveOrdersSection } from "@/components/account/AccountLiveOrdersSection";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";
import type { BuyerLiveOrderRow } from "@/lib/buyer-live-orders";
import { orderStatusLabel, orderStatusTone } from "@/lib/order-status";

type OrdersView = "marketplace" | "live";

type OrderRow = {
  id: string;
  totalUsd: number;
  status: string;
  createdAt: string;
  seller: { username: string };
  listing: { id: string; title: string; images: { url: string }[] };
};

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

export function AccountOrdersPage() {
  const { status } = useSession();
  const searchParams = useSearchParams();
  const checkoutSessionId = searchParams.get("session_id")?.trim() ?? "";
  const initialView: OrdersView = searchParams.get("view") === "live" ? "live" : "marketplace";
  const [view, setView] = useState<OrdersView>(initialView);
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [liveRows, setLiveRows] = useState<BuyerLiveOrderRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [liveLoadError, setLiveLoadError] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/account/orders");
    if (!res.ok) {
      setRows([]);
      setLoadError(res.status === 401 ? "Please sign in again." : "Could not load orders. Try again.");
      return;
    }
    const data = (await res.json()) as { orders?: OrderRow[] };
    setRows(Array.isArray(data.orders) ? data.orders : []);
  }, []);

  const loadLive = useCallback(async () => {
    setLiveLoadError(null);
    const res = await fetch("/api/account/live-orders");
    if (!res.ok) {
      setLiveRows([]);
      setLiveLoadError(res.status === 401 ? "Please sign in again." : "Could not load live purchases. Try again.");
      return;
    }
    const data = (await res.json()) as { orders?: BuyerLiveOrderRow[] };
    setLiveRows(Array.isArray(data.orders) ? data.orders : []);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (view === "live") {
      void loadLive();
    }
  }, [loadLive, status, view]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!checkoutSessionId) {
      void load();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: checkoutSessionId }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; finalized?: boolean };
        if (!cancelled) {
          if (res.ok) {
            setConfirmMessage(
              data.finalized === false ? "Payment already confirmed." : "Payment confirmed. Your order is ready.",
            );
          } else {
            setConfirmMessage(data.error ?? "We could not confirm payment yet. Your order list will refresh shortly.");
          }
        }
      } catch {
        if (!cancelled) {
          setConfirmMessage("We could not confirm payment yet. Your order list will refresh shortly.");
        }
      } finally {
        if (!cancelled) await load();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [checkoutSessionId, load, status]);

  useEffect(() => {
    setView(searchParams.get("view") === "live" ? "live" : "marketplace");
  }, [searchParams]);

  const loading = view === "live" ? liveRows === null : rows === null;

  if (status === "loading" || loading) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  const marketplaceRows = rows ?? [];

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(360px,50vh)] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.06),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-16 pt-5 sm:px-4 lg:px-10">
        <header className="border-b border-white/[0.07] pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Account</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Your orders</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            {view === "live"
              ? "Spots, teams, and purchases from live shows."
              : "Marketplace purchases — auctions, buy now, and layaway checkouts."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setView("marketplace")}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                view === "marketplace"
                  ? "border-gold/45 bg-gold/12 text-gold-bright"
                  : "border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/18 hover:text-zinc-300"
              }`}
            >
              Marketplace
            </button>
            <button
              type="button"
              onClick={() => {
                setView("live");
                if (liveRows === null) void loadLive();
              }}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                view === "live"
                  ? "border-gold/45 bg-gold/12 text-gold-bright"
                  : "border-white/10 bg-white/[0.02] text-zinc-500 hover:border-white/18 hover:text-zinc-300"
              }`}
            >
              Live shows
            </button>
          </div>
          <div className="mt-4">
            <AccountOrdersNav active="orders" mode="buyer" />
          </div>
        </header>

        {view === "live" ? (
          <AccountLiveOrdersSection
            rows={liveRows ?? []}
            loadError={liveLoadError}
            onRetry={() => void loadLive()}
          />
        ) : null}

        {view === "marketplace" && confirmMessage ? (
          <div className="mt-6 rounded-2xl border border-emerald-500/25 bg-emerald-950/20 px-5 py-4 text-sm text-emerald-100">
            {confirmMessage}
          </div>
        ) : null}

        {view === "marketplace" && loadError ? (
          <div className="mt-8 rounded-2xl border border-rose-500/25 bg-rose-950/25 px-6 py-10 text-center">
            <p className="text-sm font-medium text-rose-100">{loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-rose-300/30 px-6 text-xs font-bold uppercase tracking-wide text-rose-50 transition hover:bg-rose-500/10"
            >
              Retry
            </button>
            <Link href="/marketplace" className="mt-4 block text-xs font-semibold text-gold-bright hover:underline">
              Browse marketplace
            </Link>
          </div>
        ) : view === "marketplace" && marketplaceRows.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-16 text-center">
            <p className="font-display text-lg font-semibold text-foreground">You haven&apos;t purchased anything yet.</p>
            <p className="mt-2 text-sm text-zinc-500">
              Win an auction or use Buy now — orders, payment steps, and tracking will show up here. We&apos;ll also ping you in{" "}
              <Link href="/account/notifications" className="font-semibold text-gold-bright/90 hover:underline">
                notifications
              </Link>
              .
            </p>
            <Link
              href="/marketplace"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110"
            >
              Browse marketplace
            </Link>
          </div>
        ) : view === "marketplace" ? (
          <>
            <div className="mt-8 hidden overflow-hidden rounded-xl border border-white/[0.08] bg-[#08080a] md:block">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-2.5 pl-3.5">Item</th>
                    <th className="px-2 py-2.5">Seller</th>
                    <th className="px-2 py-2.5">Total</th>
                    <th className="px-2 py-2.5">Status</th>
                    <th className="px-2 py-2.5">Date</th>
                    <th className="px-3 py-2.5 pr-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {marketplaceRows.map((o) => {
                    const thumb = o.listing.images[0]?.url;
                    return (
                      <tr key={o.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02]">
                        <td className="px-3 py-2 pl-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="relative size-11 shrink-0 overflow-hidden rounded-md border border-white/10 bg-[#0b0b0e]">
                              {thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumb} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-[9px] text-zinc-600">—</div>
                              )}
                            </div>
                            <p className="line-clamp-2 max-w-[14rem] font-medium leading-snug text-zinc-100">{o.listing.title}</p>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs text-zinc-400">@{o.seller.username}</td>
                        <td className="px-2 py-2 font-mono text-xs font-semibold tabular-nums text-zinc-200">{formatMoney(o.totalUsd)}</td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${orderStatusTone(o.status)}`}
                          >
                            {orderStatusLabel(o.status)}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-xs tabular-nums text-zinc-500">{formatDate(o.createdAt)}</td>
                        <td className="px-3 py-2 pr-3.5 text-right">
                          <Link
                            href={`/orders/${encodeURIComponent(o.id)}`}
                            className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-gold-bright/90 transition hover:border-gold/35"
                          >
                            View order
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 space-y-3 md:hidden">
              {marketplaceRows.map((o) => {
                const thumb = o.listing.images[0]?.url;
                return (
                  <div key={o.id} className="rounded-xl border border-white/[0.08] bg-[#0a0a0d] p-3.5">
                    <div className="flex gap-3">
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#0b0b0e]">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">—</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug text-zinc-100">{o.listing.title}</p>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          @{o.seller.username} · {formatDate(o.createdAt)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-gold-bright">{formatMoney(o.totalUsd)}</span>
                          <span className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase ${orderStatusTone(o.status)}`}>
                            {orderStatusLabel(o.status)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 border-t border-white/[0.06] pt-3">
                      <Link
                        href={`/orders/${encodeURIComponent(o.id)}`}
                        className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-xs font-semibold text-gold-bright"
                      >
                        View order
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
