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
    <div className="flex min-h-0 flex-col gap-3 p-2.5">
      <div className="space-y-2">
        <Link
          href="/seller/live"
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-500 transition hover:text-zinc-300"
        >
          <span aria-hidden>←</span> Seller live
        </Link>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">Live show</p>
          <h1 className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-zinc-200">{streamTitle}</h1>
          <p className="mt-0.5 text-xs font-medium text-zinc-500">@{hostUsername}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${
              roomLive ? "bg-red-600/90 text-white ring-1 ring-red-400/40" : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {roomLive ? <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden /> : null}
            {roomLive ? "Live" : "Scheduled"}
          </span>
          <span className="rounded-full border border-white/[0.08] bg-black/35 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-400">
            {viewerCount.toLocaleString()} watching
          </span>
          {roomLive ? (
            <span className="rounded-full border border-white/[0.08] bg-black/35 px-1.5 py-0.5 font-mono text-[9px] font-semibold tabular-nums text-zinc-500">
              {streamTimerDisplay}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 border-t border-white/[0.06] pt-2.5">
        <VaultHostAnnouncements variant="desktopSidebar" />
        <button
          type="button"
          onClick={onOpenCommandCenter}
          className="w-full rounded-lg border border-amber-400/20 bg-gradient-to-r from-amber-500/10 to-yellow-500/6 px-2.5 py-2 text-left transition hover:border-amber-400/35"
        >
          <p className="text-[8px] font-black uppercase tracking-[0.14em] text-amber-200/85">Vault controls</p>
          <p className="mt-0.5 text-[10px] font-medium text-zinc-500">Queue · sales · stream</p>
        </button>
      </div>
    </div>
  );
}
