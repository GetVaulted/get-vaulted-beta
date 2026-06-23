"use client";

import Link from "next/link";
import type { BuyerLiveOrderRow } from "@/lib/buyer-live-orders";

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

function kindLabel(kind: BuyerLiveOrderRow["kind"]): string {
  if (kind === "giveaway") return "Giveaway";
  if (kind === "break_spot") return "Break spot";
  if (kind === "variant_purchase") return "Live spot";
  return "Shipped item";
}

function toneClasses(tone: BuyerLiveOrderRow["paymentTone"]): string {
  if (tone === "paid") return "border-emerald-500/30 bg-emerald-950/30 text-emerald-200";
  if (tone === "retry") return "border-rose-500/30 bg-rose-950/30 text-rose-200";
  return "border-amber-500/30 bg-amber-950/25 text-amber-200";
}

export function AccountLiveOrdersSection({
  rows,
  loadError,
  onRetry,
}: {
  rows: BuyerLiveOrderRow[];
  loadError: string | null;
  onRetry: () => void;
}) {
  if (loadError) {
    return (
      <div className="mt-8 rounded-2xl border border-rose-500/25 bg-rose-950/25 px-6 py-10 text-center">
        <p className="text-sm font-medium text-rose-100">{loadError}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-rose-300/30 px-6 text-xs font-bold uppercase tracking-wide text-rose-50 transition hover:bg-rose-500/10"
        >
          Retry
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-16 text-center">
        <p className="font-display text-lg font-semibold text-foreground">No live purchases yet</p>
        <p className="mt-2 text-sm text-zinc-500">
          PYT/PYD spots, break claims, and live buy-now orders from shows will appear here.
        </p>
        <Link
          href="/live"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110"
        >
          Browse live shows
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mt-8 hidden overflow-hidden rounded-xl border border-white/[0.08] bg-[#08080a] md:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2.5 pl-3.5">Purchase</th>
              <th className="px-2 py-2.5">Show</th>
              <th className="px-2 py-2.5">Seller</th>
              <th className="px-2 py-2.5">Total</th>
              <th className="px-2 py-2.5">Status</th>
              <th className="px-2 py-2.5">Date</th>
              <th className="px-3 py-2.5 pr-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02]">
                <td className="px-3 py-2 pl-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="relative size-11 shrink-0 overflow-hidden rounded-md border border-white/10 bg-[#0b0b0e]">
                      {o.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={o.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[9px] font-bold uppercase text-amber-400/80">
                          Live
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-1 font-medium leading-snug text-zinc-100">{o.title}</p>
                      <p className="mt-0.5 text-[10px] text-zinc-500">
                        {kindLabel(o.kind)}
                        {o.spotLabel ? ` · ${o.spotLabel}` : ""}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 text-xs text-zinc-400">{o.liveRoomTitle}</td>
                <td className="px-2 py-2 text-xs text-zinc-400">@{o.sellerUsername}</td>
                <td className="px-2 py-2 font-mono text-xs font-semibold tabular-nums text-zinc-200">
                  {formatMoney(o.amountUsd)}
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${toneClasses(o.paymentTone)}`}
                  >
                    {o.statusLabel}
                  </span>
                </td>
                <td className="px-2 py-2 text-xs tabular-nums text-zinc-500">{formatDate(o.occurredAt)}</td>
                <td className="px-3 py-2 pr-3.5 text-right">
                  <Link
                    href={o.href}
                    className="rounded-md border border-white/12 px-2 py-1 text-[11px] font-medium text-gold-bright/90 transition hover:border-gold/35"
                  >
                    {o.orderId ? "View order" : o.kind === "giveaway" ? "Add address" : "Open show"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 space-y-3 md:hidden">
        {rows.map((o) => (
          <div key={o.id} className="rounded-xl border border-white/[0.08] bg-[#0a0a0d] p-3.5">
            <div className="flex gap-3">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#0b0b0e]">
                {o.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] font-bold uppercase text-amber-400/80">
                    Live
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug text-zinc-100">{o.title}</p>
                <p className="mt-1 text-[10px] text-zinc-500">
                  {o.liveRoomTitle} · @{o.sellerUsername}
                </p>
                {o.spotLabel ? <p className="mt-1 text-xs font-semibold text-amber-100/90">{o.spotLabel}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-gold-bright">{formatMoney(o.amountUsd)}</span>
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase ${toneClasses(o.paymentTone)}`}
                  >
                    {o.statusLabel}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-zinc-600">{formatDate(o.occurredAt)}</p>
              </div>
            </div>
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              <Link
                href={o.href}
                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-xs font-semibold text-gold-bright"
              >
                {o.orderId ? "View order" : "Open show"}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
