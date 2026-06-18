"use client";

import type { HostBroadcastPhase } from "@/hooks/useHostStagePublish";

/**
 * Persistent Go Live / Pause / Stop Stream controls for the seller console stage chrome.
 */
export function VaultBroadcastControl({
  phase,
  roomLive = false,
  onStart,
  onStop,
  onPause,
  onResume,
}: {
  phase: HostBroadcastPhase;
  /** Whether the room is already live (controls the idle label: "Go Live" vs "Start Stream"). */
  roomLive?: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause?: () => void;
  onResume?: () => void;
}) {
  const baseClass =
    "inline-flex max-w-[9rem] items-center gap-1 rounded-full border px-2 py-[3px] text-[8px] font-black uppercase tracking-[0.12em] backdrop-blur-md transition active:scale-95 disabled:opacity-50 max-[360px]:max-w-[7.5rem] max-[360px]:gap-0.5 max-[360px]:px-1.5 max-[360px]:text-[7px] max-[360px]:tracking-[0.08em]";

  const pauseClass = `${baseClass} border-amber-400/40 bg-amber-950/55 text-amber-50 hover:bg-amber-900/55`;
  const stopClass = `${baseClass} border-rose-400/45 bg-rose-950/55 text-rose-50 shadow-[0_0_22px_-10px_rgba(244,63,94,0.6)] hover:bg-rose-900/65`;

  if (phase === "paused") {
    return (
      <div className="flex items-center gap-1">
        <button type="button" onClick={onResume} aria-label="Resume stream" className={pauseClass}>
          <span className="truncate">Resume</span>
        </button>
        <button
          type="button"
          disabled={phase === "stopping"}
          onClick={onStop}
          aria-label="Stop stream"
          className={stopClass}
        >
          <span className="truncate">Stop</span>
        </button>
      </div>
    );
  }

  const isBroadcasting = phase === "live" || phase === "stopping";
  const idleLabel = roomLive ? "Start Stream" : "Go Live";

  if (isBroadcasting) {
    return (
      <div className="flex items-center gap-1">
        {onPause && phase === "live" ? (
          <button type="button" onClick={onPause} aria-label="Pause stream" className={pauseClass}>
            <span className="truncate">Pause</span>
          </button>
        ) : null}
        <button
          type="button"
          disabled={phase === "stopping"}
          onClick={onStop}
          aria-label="Stop stream"
          className={stopClass}
        >
          <span
            className="inline-flex size-1.5 shrink-0 rounded-full bg-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.9)] motion-safe:animate-pulse"
            aria-hidden
          />
          <span className="truncate">{phase === "stopping" ? "Stopping…" : "Stop"}</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={phase === "starting"}
      onClick={onStart}
      aria-label="Start stream"
      className={`${baseClass} border-amber-400/40 bg-gradient-to-r from-amber-500/20 to-yellow-500/10 text-amber-50 shadow-[0_0_22px_-10px_rgba(245,158,11,0.55)] hover:from-amber-500/30 hover:to-yellow-500/15`}
    >
      <span
        className="inline-flex size-1.5 shrink-0 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.9)] motion-safe:animate-pulse"
        aria-hidden
      />
      <span className="truncate">{phase === "starting" ? "Starting stream…" : idleLabel}</span>
    </button>
  );
}
