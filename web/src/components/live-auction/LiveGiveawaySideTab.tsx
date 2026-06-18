"use client";

import { useEffect, useMemo, useState } from "react";
import type { ViewerGiveawayDTO } from "@/lib/live-giveaway";
import { LiveGiveawayEnterStrip } from "@/components/live-auction/LiveGiveawayEnterStrip";

type Props = {
  liveRoomId: string;
  giveaways: ViewerGiveawayDTO[];
  signedIn: boolean;
  onRequireSignIn?: () => void;
  onEntered?: () => void;
  onTimerExpired?: () => void;
};

/** Left-edge ghost tab — expands into the emerald giveaway enter panel for buyers. */
export function LiveGiveawaySideTab({
  liveRoomId,
  giveaways,
  signedIn,
  onRequireSignIn,
  onEntered,
  onTimerExpired,
}: Props) {
  const [open, setOpen] = useState(false);

  const visible = useMemo(
    () => giveaways.filter((g) => g.kind === "open" && g.status === "entries_open"),
    [giveaways],
  );

  const needsEntry = visible.some((g) => !g.viewerEntered);

  useEffect(() => {
    if (visible.length === 0) setOpen(false);
  }, [visible.length]);

  if (visible.length === 0) return null;

  return (
    <div
      className="pointer-events-auto flex max-w-[min(20rem,calc(100vw-2rem))] items-center"
      data-testid="live-giveaway-side-tab"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="live-giveaway-side-panel"
        aria-label={open ? "Close giveaway" : "Open giveaway"}
        onClick={() => setOpen((v) => !v)}
        className={`group relative flex min-h-[4.5rem] w-8 shrink-0 flex-col items-center justify-center gap-0.5 rounded-r-xl border border-l-0 border-emerald-400/35 bg-emerald-500/20 py-2 pl-0.5 pr-1 shadow-[4px_0_24px_-8px_rgba(16,185,129,0.55)] backdrop-blur-md transition hover:bg-emerald-500/30 ${
          needsEntry && !open ? "animate-pulse" : ""
        }`}
      >
        <span className="text-[15px] leading-none" aria-hidden>
          🎁
        </span>
        <span className="text-[8px] font-black uppercase leading-tight tracking-[0.14em] text-emerald-50">
          Givvy
        </span>
        {needsEntry ? (
          <span
            className="absolute -right-0.5 top-1 size-2 rounded-full bg-emerald-300 ring-2 ring-black/40"
            aria-hidden
          />
        ) : null}
      </button>

      <div
        id="live-giveaway-side-panel"
        className={`overflow-hidden transition-[max-width,opacity,margin] duration-200 ease-out ${
          open ? "ml-1.5 max-w-[min(18rem,calc(100vw-3.5rem))] opacity-100" : "max-w-0 opacity-0"
        }`}
        aria-hidden={!open}
      >
        {open ? (
          <div className="min-w-[min(18rem,calc(100vw-3.5rem))] rounded-xl border border-emerald-400/20 bg-black/55 p-2 shadow-xl backdrop-blur-xl">
            <LiveGiveawayEnterStrip
              liveRoomId={liveRoomId}
              giveaways={giveaways}
              signedIn={signedIn}
              onRequireSignIn={onRequireSignIn}
              onEntered={onEntered}
              onTimerExpired={onTimerExpired}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
