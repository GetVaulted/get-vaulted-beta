"use client";

import type { ReactNode } from "react";
import { BUYER_LIVE_DESKTOP_COL, BUYER_LIVE_DESKTOP_GRID } from "@/components/live-auction/buyer/buyerLiveLayout";

export type BuyerLiveDesktopShellProps = {
  hostStrip: ReactNode;
  chat: ReactNode;
  video: ReactNode;
  lineup?: ReactNode;
  hostBanner?: ReactNode;
};

/**
 * Desktop buyer live layout (≥1280px): 20% chat · 60% stage · 20% lineup.
 * Seller console does not use this shell.
 */
export function BuyerLiveDesktopShell({
  hostStrip,
  chat,
  video,
  lineup,
  hostBanner,
}: BuyerLiveDesktopShellProps) {
  /** Buyers always pass `lineup` (empty queue uses the same 20-60-20 grid). Hosts omit it → 20-80. */
  const gridClass = lineup
    ? BUYER_LIVE_DESKTOP_GRID
    : "grid h-full min-h-0 w-full max-w-[1920px] grid-cols-[minmax(0,20%)_minmax(0,80%)] gap-2 px-2 py-2 md:gap-2 md:px-3 md:py-2";

  return (
    <div className={gridClass}>
      <aside className={BUYER_LIVE_DESKTOP_COL}>
        {hostStrip}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{chat}</div>
      </aside>

      <main className={`${BUYER_LIVE_DESKTOP_COL} min-h-0 gap-0 overflow-hidden`}>
        {hostBanner ? <div className="shrink-0 border-b border-zinc-800/80 px-2 py-1.5">{hostBanner}</div> : null}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black [container-type:size]">
          {video}
        </div>
      </main>

      {lineup ? <aside className={BUYER_LIVE_DESKTOP_COL}>{lineup}</aside> : null}
    </div>
  );
}
