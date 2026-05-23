"use client";

import Link from "next/link";
import { VaultHostAnnouncements } from "@/components/break-host/vault/VaultHostAnnouncements";

type VaultHostShowSidePanelProps = {
  streamTitle: string;
  hostUsername: string;
  viewerCount: number;
  streamTimerDisplay: string;
  roomLive: boolean;
  onOpenCommandCenter: () => void;
};

export function VaultHostShowSidePanel({
  streamTitle,
  hostUsername,
  viewerCount,
  streamTimerDisplay,
  roomLive,
  onOpenCommandCenter,
}: VaultHostShowSidePanelProps) {
  return (
    <div className="flex min-h-0 flex-col gap-4 p-3">
      <div className="space-y-3">
        <Link
          href="/seller/live"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 transition hover:text-zinc-300"
        >
          <span aria-hidden>←</span> Seller live
        </Link>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Live show</p>
          <h1 className="mt-1 line-clamp-2 text-base font-bold leading-snug text-zinc-100">{streamTitle}</h1>
          <p className="mt-1 text-sm font-medium text-zinc-400">@{hostUsername}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
              roomLive ? "bg-red-600/90 text-white ring-1 ring-red-400/40" : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {roomLive ? <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden /> : null}
            {roomLive ? "Live" : "Scheduled"}
          </span>
          <span className="rounded-full border border-white/[0.08] bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
            {viewerCount.toLocaleString()} watching
          </span>
          {roomLive ? (
            <span className="rounded-full border border-white/[0.08] bg-black/40 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-zinc-400">
              {streamTimerDisplay}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <VaultHostAnnouncements variant="desktopSidebar" />
        <button
          type="button"
          onClick={onOpenCommandCenter}
          className="w-full rounded-xl border border-amber-400/25 bg-gradient-to-r from-amber-500/12 to-yellow-500/8 px-3 py-2.5 text-left transition hover:border-amber-400/40"
        >
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-200/90">Vault controls</p>
          <p className="mt-0.5 text-[11px] font-medium text-zinc-400">Queue, sales, stream tools</p>
        </button>
      </div>
    </div>
  );
}
