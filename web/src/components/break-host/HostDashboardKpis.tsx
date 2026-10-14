"use client";

import { LiveRoomEnergyMeter } from "@/components/live-stage/LiveRoomEnergyMeter";
import { centsToUsd, type LiveShowSellerSummaryDTO } from "@/lib/live-show-seller-summary-shared";
import type { LiveRoomEnergyLevel } from "@/lib/live-room-energy";

function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 1000 ? 0 : 2 });
}

function fmtPct(pct: number) {
  return `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
}

type Props = {
  summary: LiveShowSellerSummaryDTO | null;
  loading: boolean;
  refreshError?: boolean;
  viewerCount: number;
  streamTimerDisplay: string;
  connectionLabel: string;
  connectionOk: boolean;
  roomEnergyScore: number;
  roomEnergyLevel: LiveRoomEnergyLevel;
};

function Kpi({ label, value, hint, tone = "text-zinc-50" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.08] bg-zinc-950/90 px-3.5 py-2">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className={`mt-0.5 truncate text-xl font-extrabold tabular-nums leading-tight ${tone}`}>{value}</p>
      {hint ? <p className="truncate text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

/**
 * Live headline numbers for the PC host dashboard. Everything here comes from data the console
 * already loads (show sales summary, viewer count, stream timer, room energy) — nothing new is
 * fetched. While the summary is still loading we show dashes, never a made-up zero.
 */
export function HostDashboardKpis({
  summary,
  loading,
  refreshError,
  viewerCount,
  streamTimerDisplay,
  connectionLabel,
  connectionOk,
  roomEnergyScore,
  roomEnergyLevel,
}: Props) {
  const dash = loading || !summary ? "—" : null;
  const netUsd = summary ? centsToUsd(summary.netShowSalesCents) : 0;
  const orders = summary?.paidOrderCount ?? 0;
  const avg = summary && orders > 0 ? centsToUsd(Math.round(summary.netShowSalesCents / orders)) : 0;
  const untilNext = summary?.amountUntilNextTierCents != null ? centsToUsd(summary.amountUntilNextTierCents) : null;

  return (
    <div className="grid shrink-0 grid-cols-6 gap-2" data-host-dashboard-kpis>
      <Kpi
        label="Sales this show"
        value={dash ?? fmtUsd(netUsd)}
        hint={refreshError ? "Couldn't refresh — retrying" : summary && summary.refundedShowSalesCents > 0 ? `${fmtUsd(centsToUsd(summary.refundedShowSalesCents))} refunded` : "Net of refunds"}
        tone="text-amber-200"
      />
      <Kpi label="Paid orders" value={dash ?? String(orders)} hint="Unique paid item sales" />
      <Kpi label="Avg sale" value={dash ?? (orders > 0 ? fmtUsd(avg) : "—")} hint={orders > 0 ? "Net sales ÷ orders" : "No sales yet"} />
      <Kpi
        label="Your fee tier"
        value={dash ?? fmtPct(summary!.currentFeeRatePercent)}
        hint={untilNext != null && untilNext > 0 ? `${fmtUsd(untilNext)} to next tier` : "Top tier"}
      />
      <Kpi
        label="Viewers"
        value={String(viewerCount)}
        hint={`${streamTimerDisplay} on air · ${connectionOk ? "connected" : connectionLabel.toLowerCase()}`}
        tone={connectionOk ? "text-zinc-50" : "text-amber-300"}
      />
      <div className="min-w-0 rounded-xl border border-white/[0.08] bg-zinc-950/90 px-3.5 py-2">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">Room energy</p>
        <div className="mt-1.5">
          <LiveRoomEnergyMeter score={roomEnergyScore} level={roomEnergyLevel} compact />
        </div>
      </div>
    </div>
  );
}
