"use client";

import { SELLER_CONSOLE } from "@/lib/seller-console-copy";
import { VaultBroadcastControl } from "@/components/break-host/vault/VaultBroadcastControl";
import type { HostBroadcastPhase } from "@/hooks/useHostStagePublish";

type SellerConsoleActionBarProps = {
  onShare: () => void;
  onAddItem: () => void;
  onObs: () => void;
  broadcastPhase: HostBroadcastPhase;
  roomLive: boolean;
  onGoLive: () => void;
  onStopStream: () => void;
  streamTimerDisplay?: string;
  viewerCount?: number;
};

export function SellerConsoleActionBar({
  onShare,
  onAddItem,
  onObs,
  broadcastPhase,
  roomLive,
  onGoLive,
  onStopStream,
  streamTimerDisplay,
  viewerCount,
}: SellerConsoleActionBarProps) {
  const phaseForControl =
    broadcastPhase === "preview" ? "idle" : broadcastPhase === "starting" || broadcastPhase === "stopping" ? broadcastPhase : broadcastPhase;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.08] bg-zinc-950/95 px-3 py-2 backdrop-blur-md">
      <button
        type="button"
        onClick={onShare}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-gold/35 bg-gold/10 px-3.5 text-xs font-bold text-gold-bright hover:bg-gold/15"
      >
        <span aria-hidden>↗</span>
        {SELLER_CONSOLE.shareShow}
      </button>
      <button
        type="button"
        onClick={onAddItem}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3.5 text-xs font-bold text-zinc-100 hover:bg-white/[0.1]"
      >
        <span aria-hidden>+</span>
        {SELLER_CONSOLE.addItem}
      </button>
      <button
        type="button"
        onClick={onObs}
        className="inline-flex min-h-9 items-center rounded-full border border-white/12 px-3 text-xs font-bold text-zinc-300 hover:bg-white/[0.06]"
      >
        {SELLER_CONSOLE.obsSetup}
      </button>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {typeof viewerCount === "number" ? (
          <span className="text-xs font-bold tabular-nums text-zinc-400">
            {SELLER_CONSOLE.viewers} {viewerCount}
          </span>
        ) : null}
        {streamTimerDisplay ? (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-zinc-400">
            {streamTimerDisplay}
          </span>
        ) : null}
        <VaultBroadcastControl
          phase={phaseForControl as "idle" | "starting" | "live" | "stopping"}
          roomLive={roomLive}
          onStart={onGoLive}
          onStop={onStopStream}
        />
      </div>
    </div>
  );
}
