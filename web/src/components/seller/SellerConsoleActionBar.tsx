"use client";

import { SELLER_CONSOLE } from "@/lib/seller-console-copy";
import { VaultBroadcastControl } from "@/components/break-host/vault/VaultBroadcastControl";
import type { HostBroadcastPhase } from "@/hooks/useHostStagePublish";

type SellerConsoleActionBarProps = {
  onShare: () => void;
  onAddItem: () => void;
  onOpenLineup?: () => void;
  lineupCount?: number;
  lineupActive?: boolean;
  onObs: () => void;
  broadcastPhase: HostBroadcastPhase;
  roomLive: boolean;
  /** Camera already publishing from phone / another device — PC is command center only. */
  companionMode?: boolean;
  onGoLive: () => void;
  onStopStream: () => void;
  onPauseStream?: () => void;
  onResumeStream?: () => void;
  streamTimerDisplay?: string;
  viewerCount?: number;
  /** Current in-browser publish Lite mode state (undefined when not applicable, e.g. OBS/companion). */
  liteMode?: boolean;
  onToggleLiteMode?: (next: boolean) => void;
};

export function SellerConsoleActionBar({
  onShare,
  onAddItem,
  onOpenLineup,
  lineupCount = 0,
  lineupActive = false,
  onObs,
  broadcastPhase,
  roomLive,
  companionMode = false,
  onGoLive,
  onStopStream,
  onPauseStream,
  onResumeStream,
  streamTimerDisplay,
  viewerCount,
  liteMode = false,
  onToggleLiteMode,
}: SellerConsoleActionBarProps) {
  const phaseForControl =
    broadcastPhase === "preview" ? "idle" : broadcastPhase === "starting" || broadcastPhase === "stopping" ? broadcastPhase : broadcastPhase;
  // Only meaningful while this device is the one actually publishing via in-browser WebRTC -
  // irrelevant for OBS ingest, and toggling it on a companion/command-center device wouldn't
  // touch the phone that's actually encoding.
  const showLiteToggle = Boolean(onToggleLiteMode) && !companionMode && (broadcastPhase === "live" || broadcastPhase === "paused");

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
      {onOpenLineup ? (
        <button
          type="button"
          onClick={onOpenLineup}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold ${
            lineupActive
              ? "border-amber-300/45 bg-amber-500/22 text-amber-50"
              : "border-violet-400/30 bg-violet-500/15 text-violet-100 hover:bg-violet-500/22"
          }`}
        >
          {SELLER_CONSOLE.lineup}
          {lineupCount > 0 ? <span className="tabular-nums">({lineupCount})</span> : null}
        </button>
      ) : null}
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
        {showLiteToggle ? (
          <button
            type="button"
            onClick={() => onToggleLiteMode?.(!liteMode)}
            title="Lower video quality to reduce heat and data use"
            className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-bold ${
              liteMode
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                : "border-white/12 text-zinc-300 hover:bg-white/[0.06]"
            }`}
          >
            {liteMode ? "Lite: On" : "Lite mode"}
          </button>
        ) : null}
        <VaultBroadcastControl
          phase={phaseForControl as "idle" | "starting" | "live" | "paused" | "stopping"}
          roomLive={roomLive}
          companionMode={companionMode}
          onStart={onGoLive}
          onStop={onStopStream}
          onPause={onPauseStream}
          onResume={onResumeStream}
        />
      </div>
    </div>
  );
}
