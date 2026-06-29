"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HostRecentSaleRowDTO } from "@/lib/live-room-recent-sales";
import type { SellerAccountLiveShowRow } from "@/lib/seller-account-live-shows";

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

function statusBadge(status: SellerAccountLiveShowRow["status"]) {
  if (status === "live") return "border-rose-400/35 bg-rose-950/35 text-rose-100";
  if (status === "scheduled") return "border-sky-400/30 bg-sky-950/30 text-sky-100";
  return "border-white/12 bg-white/[0.04] text-zinc-400";
}

function paymentToneClasses(tone: HostRecentSaleRowDTO["paymentTone"]) {
  if (tone === "paid") return "border-emerald-500/30 bg-emerald-950/30 text-emerald-200";
  if (tone === "retry") return "border-rose-500/30 bg-rose-950/30 text-rose-200";
  return "border-amber-500/30 bg-amber-950/25 text-amber-200";
}

export function AccountSellerLiveSalesSection() {
  const [shows, setShows] = useState<SellerAccountLiveShowRow[] | null>(null);
  const [showsError, setShowsError] = useState<string | null>(null);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [sales, setSales] = useState<HostRecentSaleRowDTO[] | null>(null);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);

  const selectedShow = useMemo(
    () => shows?.find((s) => s.id === selectedShowId) ?? null,
    [selectedShowId, shows],
  );

  const loadShows = useCallback(async () => {
    setShowsError(null);
    const res = await fetch("/api/account/seller-live-shows", { cache: "no-store" });
    if (!res.ok) {
      setShows([]);
      setShowsError(res.status === 401 ? "Please sign in again." : "Could not load live shows.");
      return;
    }
    const data = (await res.json()) as { shows?: SellerAccountLiveShowRow[] };
    const rows = Array.isArray(data.shows) ? data.shows : [];
    setShows(rows);
    setSelectedShowId((prev) => {
      if (prev && rows.some((r) => r.id === prev)) return prev;
      return rows.find((r) => r.status === "live")?.id ?? rows[0]?.id ?? null;
    });
  }, []);

  const loadSales = useCallback(
    async (showId: string, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setSalesLoading(true);
      setSalesError(null);
      const res = await fetch(`/api/account/seller-live-shows/${encodeURIComponent(showId)}/sales`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setSales([]);
        setSalesError("Could not load live sales for this show.");
        if (!opts?.silent) setSalesLoading(false);
        return;
      }
      const data = (await res.json()) as { sales?: HostRecentSaleRowDTO[] };
      setSales(Array.isArray(data.sales) ? data.sales : []);
      if (!opts?.silent) setSalesLoading(false);
    },
    [],
  );

  useEffect(() => {
    void loadShows();
  }, [loadShows]);

  useEffect(() => {
    if (!selectedShowId) {
      setSales(null);
      return;
    }
    void loadSales(selectedShowId);
  }, [loadSales, selectedShowId]);

  useEffect(() => {
    if (!selectedShowId || selectedShow?.status !== "live") return undefined;
    const timer = window.setInterval(() => {
      void loadSales(selectedShowId, { silent: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadSales, selectedShow?.status, selectedShowId]);

  if (shows === null) {
    return <p className="mt-8 text-center text-sm text-zinc-500">Loading live shows…</p>;
  }

  if (showsError) {
    return (
      <div className="mt-8 rounded-2xl border border-rose-500/25 bg-rose-950/25 px-6 py-10 text-center">
        <p className="text-sm font-medium text-rose-100">{showsError}</p>
        <button
          type="button"
          onClick={() => void loadShows()}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-rose-300/30 px-6 text-xs font-bold uppercase tracking-wide text-rose-50 transition hover:bg-rose-500/10"
        >
          Retry
        </button>
      </div>
    );
  }

  if (shows.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-16 text-center">
        <p className="font-display text-lg font-semibold text-foreground">No live shows yet</p>
        <p className="mt-2 text-sm text-zinc-500">Schedule or go live — sales from each show will appear here in real time.</p>
        <Link
          href="/seller/live"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950"
        >
          Go live
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(240px,280px)_1fr]">
      <aside className="rounded-xl border border-white/[0.08] bg-[#08080a] p-3">
        <p className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Live shows</p>
        <ul className="mt-3 max-h-[min(520px,60vh)] space-y-2 overflow-y-auto pr-1">
          {shows.map((show) => {
            const active = show.id === selectedShowId;
            return (
              <li key={show.id}>
                <button
                  type="button"
                  onClick={() => setSelectedShowId(show.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-gold/40 bg-gold/[0.08] text-zinc-100"
                      : "border-white/[0.06] bg-zinc-950/50 text-zinc-400 hover:border-white/15"
                  }`}
                >
                  <span className="block font-semibold text-zinc-100">{show.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusBadge(show.status)}`}
                    >
                      {show.status}
                    </span>
                    {show.scheduledStartAt && show.status === "scheduled" ? (
                      <span className="text-[10px] text-zinc-500">{formatWhen(show.scheduledStartAt)}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Live sales</p>
            <h2 className="font-display mt-1 text-lg font-bold text-foreground">
              {selectedShow?.title ?? "Select a show"}
            </h2>
            {selectedShow?.status === "live" ? (
              <p className="mt-1 text-xs text-emerald-300/90">Updating every 5 seconds while you&apos;re live.</p>
            ) : null}
          </div>
          {selectedShowId ? (
            <button
              type="button"
              onClick={() => void loadSales(selectedShowId)}
              className="rounded-full border border-white/12 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-300 transition hover:border-white/20"
            >
              Refresh
            </button>
          ) : null}
        </div>

        {salesError ? (
          <div className="mt-4 rounded-xl border border-rose-500/25 bg-rose-950/20 px-4 py-3 text-sm text-rose-100">
            {salesError}
          </div>
        ) : null}

        {salesLoading && sales === null ? (
          <p className="mt-8 text-center text-sm text-zinc-500">Loading sales…</p>
        ) : !selectedShowId ? (
          <p className="mt-8 text-center text-sm text-zinc-500">Pick a show to view sales.</p>
        ) : (sales?.length ?? 0) === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center text-sm text-zinc-500">
            No paid sales on this show yet. New purchases will appear here automatically.
          </p>
        ) : (
          <>
            <div className="mt-4 hidden overflow-hidden rounded-xl border border-white/[0.08] bg-[#08080a] md:block">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-2.5 pl-3.5">Item</th>
                    <th className="px-2 py-2.5">Buyer</th>
                    <th className="px-2 py-2.5">Paid</th>
                    <th className="px-2 py-2.5">Time</th>
                    <th className="px-3 py-2.5 pr-3.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(sales ?? []).map((row) => (
                    <tr key={row.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02]">
                      <td className="px-3 py-2 pl-3.5">
                        <p className="line-clamp-2 max-w-[18rem] font-medium leading-snug text-zinc-100">{row.itemTitle}</p>
                        {row.spotLabel && row.spotLabel !== row.itemTitle ? (
                          <p className="mt-0.5 text-[10px] font-semibold text-amber-200/85">{row.spotLabel}</p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-xs text-zinc-300">@{row.buyerUsername}</td>
                      <td className="px-2 py-2 font-mono text-xs font-semibold tabular-nums text-zinc-200">
                        {formatMoney(row.amountUsd)}
                      </td>
                      <td className="px-2 py-2 text-xs tabular-nums text-zinc-500">{formatWhen(row.occurredAt)}</td>
                      <td className="px-3 py-2 pr-3.5">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${paymentToneClasses(row.paymentTone)}`}
                        >
                          {row.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-3 md:hidden">
              {(sales ?? []).map((row) => (
                <div key={row.id} className="rounded-xl border border-white/[0.08] bg-[#0a0a0d] p-3.5">
                  <p className="font-medium leading-snug text-zinc-100">{row.itemTitle}</p>
                  {row.spotLabel && row.spotLabel !== row.itemTitle ? (
                    <p className="mt-1 text-xs font-semibold text-amber-200/85">{row.spotLabel}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-zinc-400">
                    @{row.buyerUsername} · {formatWhen(row.occurredAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-gold-bright">{formatMoney(row.amountUsd)}</span>
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase ${paymentToneClasses(row.paymentTone)}`}
                    >
                      {row.statusLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
