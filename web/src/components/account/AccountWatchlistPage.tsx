"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";

type Row = {
  watchlistItemId: string;
  listingId: string;
  title: string;
  thumbUrl: string | null;
  priceUsd: number;
  buyingFormat: string;
  sellerUsername: string;
  status: string;
  savedAt: string;
};

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatSaved(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function statusLabel(s: string): string {
  if (s === "auction_live") return "Auction live";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statusTone(s: string): string {
  if (s === "active") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200/95";
  if (s === "sold") return "border-rose-400/25 bg-rose-950/35 text-rose-100/90";
  if (s === "draft") return "border-zinc-500/25 bg-zinc-800/40 text-zinc-300";
  if (s === "auction_live") return "border-amber-400/25 bg-amber-950/30 text-amber-100/90";
  return "border-zinc-500/25 bg-zinc-800/40 text-zinc-400";
}

export function AccountWatchlistPage() {
  const { status } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/account/watchlist");
    if (!res.ok) {
      setRows([]);
      return;
    }
    const data = (await res.json()) as { items?: Row[] };
    setRows(Array.isArray(data.items) ? data.items : []);
  }, []);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [load, status]);

  useEffect(() => {
    const on = () => void load();
    window.addEventListener("gv-watchlist-updated", on);
    return () => window.removeEventListener("gv-watchlist-updated", on);
  }, [load]);

  const remove = async (listingId: string) => {
    const res = await fetch(`/api/watchlist/${encodeURIComponent(listingId)}`, { method: "DELETE" });
    if (res.ok) {
      window.dispatchEvent(new CustomEvent("gv-watchlist-updated", { detail: { listingId } }));
      await load();
    }
  };

  if (status === "loading" || rows === null) {
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
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Watchlist</h1>
          <p className="mt-1.5 text-sm text-zinc-500">Listings you have saved for later.</p>
          <div className="mt-4">
            <AccountOrdersNav active="watchlist" mode="buyer" />
          </div>
        </header>

        {rows.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-16 text-center">
            <p className="font-display text-lg font-semibold text-foreground">Your watchlist is empty.</p>
            <p className="mt-2 text-sm text-zinc-500">Save items from the marketplace with the bookmark icon.</p>
            <Link
              href="/marketplace"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110"
            >
              Browse marketplace
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-8 hidden overflow-hidden rounded-xl border border-white/[0.08] bg-[#08080a] md:block">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-2.5 pl-3.5">Item</th>
                    <th className="px-2 py-2.5">Price / bid</th>
                    <th className="px-2 py-2.5">Format</th>
                    <th className="px-2 py-2.5">Seller</th>
                    <th className="px-2 py-2.5">Status</th>
                    <th className="px-2 py-2.5">Saved</th>
                    <th className="px-3 py-2.5 pr-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const thumb = r.thumbUrl;
                    const fmt = r.buyingFormat === "auction" ? "Auction" : "Buy now";
                    return (
                      <tr key={r.watchlistItemId} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 pl-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="relative size-11 shrink-0 overflow-hidden rounded-md border border-white/10 bg-[#0b0b0e]">
                              {thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumb} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-[9px] text-zinc-600">—</div>
                              )}
                            </div>
                            <p className="line-clamp-2 min-w-0 font-medium leading-snug text-zinc-100">{r.title}</p>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 font-mono text-xs font-semibold tabular-nums text-zinc-200">{formatMoney(r.priceUsd)}</td>
                        <td className="px-2 py-2.5 text-xs text-zinc-400">{fmt}</td>
                        <td className="px-2 py-2.5 text-xs text-zinc-400">@{r.sellerUsername}</td>
                        <td className="px-2 py-2.5">
                          <span className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusTone(r.status)}`}>
                            {r.status === "sold" ? "Sold" : statusLabel(r.status)}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-xs tabular-nums text-zinc-500">{formatSaved(r.savedAt)}</td>
                        <td className="px-3 py-2.5 pr-3.5 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Link
                              href={`/marketplace/${encodeURIComponent(r.listingId)}`}
                              className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-semibold text-zinc-300 transition hover:border-gold/35 hover:text-gold-bright"
                            >
                              View item
                            </Link>
                            <button
                              type="button"
                              onClick={() => void remove(r.listingId)}
                              className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-zinc-500 transition hover:border-rose-400/35 hover:text-rose-200/90"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 space-y-3 md:hidden">
              {rows.map((r) => {
                const thumb = r.thumbUrl;
                const fmt = r.buyingFormat === "auction" ? "Auction" : "Buy now";
                return (
                  <div key={r.watchlistItemId} className="rounded-xl border border-white/[0.08] bg-[#0a0a0d] p-3.5">
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
                        <p className="font-medium leading-snug text-zinc-100">{r.title}</p>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          @{r.sellerUsername} · {fmt} · Saved {formatSaved(r.savedAt)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-gold-bright">{formatMoney(r.priceUsd)}</span>
                          <span className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusTone(r.status)}`}>
                            {r.status === "sold" ? "Sold" : statusLabel(r.status)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2 border-t border-white/[0.06] pt-3">
                      <Link
                        href={`/marketplace/${encodeURIComponent(r.listingId)}`}
                        className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-xs font-bold text-gold-bright"
                      >
                        View item
                      </Link>
                      <button
                        type="button"
                        onClick={() => void remove(r.listingId)}
                        className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-white/12 text-xs font-semibold text-zinc-400"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
