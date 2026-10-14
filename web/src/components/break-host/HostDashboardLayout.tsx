"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

type Props = {
  /** Top control bar (Go Live / Pause / Stop, share, OBS, …). */
  actionBar: ReactNode;
  /** Headline numbers strip. */
  kpis: ReactNode;
  /**
   * The stream video. Called with `expanded` so the caller can strip overlays/chrome for the small
   * corner tile and restore them when expanded. Rendered in the SAME tree position in both states
   * (only the wrapper's CSS changes) so the live video never remounts or reconnects on toggle.
   */
  renderVideo: (expanded: boolean) => ReactNode;
  /** Small buttons shown on the video tile (mute, notes, …). */
  videoTools?: ReactNode;
  chat: ReactNode;
  /** The "now selling" card with start/end/pin/next controls. */
  nowSelling: ReactNode;
  /** Optional team board panel (only passed while the host has it open). */
  teamBoard?: ReactNode;
  /** Extra center-column controls (e.g. team board toggle). */
  centerActions?: ReactNode;
  lineup: ReactNode;
  /** Bottom tiles: recent sales, fee tier, shipping, moderation. */
  tiles: ReactNode;
};

const LEFT_W = "320px";
const RIGHT_W = "340px";

/**
 * PC host console as a dashboard: stats on top, a small video tile in the top-left that expands to
 * check the picture and shrinks back, "now selling" controls in the middle, lineup on the right.
 * Desktop only (the caller renders this at >= 1024px); phones/tablets keep the existing layout.
 */
export function HostDashboardLayout({
  actionBar,
  kpis,
  renderVideo,
  videoTools,
  chat,
  nowSelling,
  teamBoard,
  centerActions,
  lineup,
  tiles,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const compactBox = "relative h-full w-full overflow-hidden rounded-xl border border-white/[0.12] bg-black";
  // Fixed so it can cover the left + centre columns without moving in the DOM (no video remount).
  const expandedBox = `fixed bottom-2 left-2 top-[calc(var(--site-header-offset)+0.5rem)] z-[48] overflow-hidden rounded-xl border border-amber-300/40 bg-black shadow-[0_24px_80px_-20px_rgba(0,0,0,0.95)]`;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden bg-black p-2" data-host-dashboard>
      {actionBar}
      {kpis}
      <div
        className="relative grid min-h-0 flex-1 gap-2"
        style={{ gridTemplateColumns: `${LEFT_W} minmax(0,1fr) ${RIGHT_W}` }}
      >
        {/* LEFT: video tile + chat */}
        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <div className="relative h-[clamp(220px,34vh,330px)] shrink-0">
            <div
              className={expanded ? expandedBox : compactBox}
              style={expanded ? { right: `calc(${RIGHT_W} + 1rem)` } : undefined}
              data-host-dashboard-video
              data-expanded={expanded ? "true" : "false"}
            >
              <div className={expanded ? "absolute inset-y-0 left-0 right-[380px]" : "absolute inset-0"}>
                {renderVideo(expanded)}
              </div>

              <div className="absolute right-1.5 top-1.5 z-[60] flex items-center gap-1">
                {videoTools}
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={expanded ? "Minimize video" : "Expand video"}
                  title={expanded ? "Minimize video (Esc)" : "Expand video"}
                  className="inline-flex size-7 items-center justify-center rounded-lg border border-amber-300/35 bg-black/70 text-sm font-bold leading-none text-amber-100 backdrop-blur hover:bg-amber-400/20"
                >
                  {expanded ? "⤡" : "⤢"}
                </button>
              </div>

              {expanded ? (
                <aside
                  className="absolute inset-y-0 right-0 z-[56] flex w-[380px] flex-col gap-2 overflow-y-auto border-l border-white/[0.1] bg-zinc-950/95 p-2"
                  aria-label="Now selling controls"
                >
                  {nowSelling}
                  {centerActions ? <div className="flex flex-wrap items-center gap-2">{centerActions}</div> : null}
                </aside>
              ) : null}

              {expanded ? (
                <div className="pointer-events-none absolute inset-x-0 top-2 z-[55] flex justify-center pr-[380px]">
                  <span className="rounded-full border border-amber-300/25 bg-black/70 px-3 py-1 text-[11px] text-amber-100/90">
                    Checking visuals · Esc or ⤡ to shrink back
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/95">
            {chat}
          </div>
        </div>

        {/* CENTRE: now selling, team board, tiles */}
        <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto overscroll-contain pr-0.5">
          {expanded ? (
            <p className="shrink-0 rounded-xl border border-white/[0.08] bg-zinc-950/95 px-3 py-2 text-[11px] text-zinc-400">
              Video is expanded — the now-selling controls are beside it. Press Esc to shrink the video back.
            </p>
          ) : (
            <>
              <div className="shrink-0 rounded-xl border border-amber-400/15 bg-zinc-950/95 p-2">{nowSelling}</div>
              {centerActions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{centerActions}</div> : null}
            </>
          )}
          {teamBoard ? <div className="shrink-0 rounded-xl border border-white/[0.08] bg-zinc-950/95 p-2">{teamBoard}</div> : null}
          <div className="grid shrink-0 grid-cols-2 gap-2 xl:grid-cols-4">{tiles}</div>
        </div>

        {/* RIGHT: lineup */}
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/95">
          {lineup}
        </aside>
      </div>
    </div>
  );
}
