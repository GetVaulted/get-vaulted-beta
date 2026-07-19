"use client";

import { HostRecentSalesTile } from "@/components/break-host/HostRecentSalesTile";
import { LiveShowFeeTierTile } from "@/components/break-host/LiveShowFeeTierTile";
import { LiveShowSalesTile } from "@/components/break-host/LiveShowSalesTile";
import { LiveRoomEnergyMeter } from "@/components/live-stage/LiveRoomEnergyMeter";
import { SELLER_CONSOLE } from "@/lib/seller-console-copy";
import type { HostRecentSaleRowDTO } from "@/lib/live-room-recent-sales";
import type { LiveShowFeeTierSnapshot } from "@/lib/platform-fee-policy";
import type { LiveShowSellerSummaryDTO } from "@/lib/live-show-seller-summary";
import type { LiveRoomEnergyLevel } from "@/lib/live-room-energy";

type SellerConsoleStatsPanelProps = {
  viewerCount: number;
  streamTimerDisplay: string;
  connectionLabel: string;
  connectionOk: boolean;
  roomEnergyScore: number;
  roomEnergyLevel: LiveRoomEnergyLevel;
  recentSales: HostRecentSaleRowDTO[];
  feeTier?: LiveShowFeeTierSnapshot | null;
  sellerSummary?: LiveShowSellerSummaryDTO | null;
  sellerSummaryLoading?: boolean;
  sellerSummaryRefreshError?: boolean;
};

export function SellerConsoleStatsPanel({
  viewerCount,
  streamTimerDisplay,
  connectionLabel,
  connectionOk,
  roomEnergyScore,
  roomEnergyLevel,
  recentSales,
  feeTier,
  sellerSummary,
  sellerSummaryLoading,
  sellerSummaryRefreshError,
}: SellerConsoleStatsPanelProps) {
  return (
    <div className="shrink-0 space-y-3 border-b border-white/[0.08] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{SELLER_CONSOLE.stats}</p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{SELLER_CONSOLE.viewers}</p>
          <p className="mt-0.5 text-lg font-black tabular-nums text-white">{viewerCount}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">On air</p>
          <p className="mt-0.5 text-lg font-black tabular-nums text-gold-bright">{streamTimerDisplay || "—"}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2">
        <span className="text-xs font-semibold text-zinc-400">Stream</span>
        <span className={`text-xs font-bold ${connectionOk ? "text-emerald-300" : "text-amber-200"}`}>{connectionLabel}</span>
      </div>
      <LiveRoomEnergyMeter score={roomEnergyScore} level={roomEnergyLevel} />
      <HostRecentSalesTile rows={recentSales} />
      <LiveShowSalesTile
        summary={sellerSummary}
        loading={sellerSummaryLoading}
        refreshError={sellerSummaryRefreshError}
      />
      {feeTier || sellerSummary ? <LiveShowFeeTierTile tier={feeTier} summary={sellerSummary} /> : null}
    </div>
  );
}
