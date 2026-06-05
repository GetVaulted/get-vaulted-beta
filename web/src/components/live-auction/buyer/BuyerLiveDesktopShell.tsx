"use client";

import type { ReactNode } from "react";
import { BUYER_LIVE_DESKTOP_COL, BUYER_LIVE_DESKTOP_GRID } from "@/components/live-auction/buyer/buyerLiveLayout";

export type BuyerLiveDesktopShellProps = {
  hostStrip: ReactNode;
  chat: ReactNode;
  video: ReactNode;
  /** Active item + primary CTAs + footnotes (commerce block). */
  commerce: ReactNode;
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
  commerce,
  lineup,
  hostBanner,
}: BuyerLiveDesktopShellProps) {
  const gridClass = lineup
    ? BUYER_LIVE_DESKTOP_GRID
    : "grid h-full min-h-0 w-full max-w-[1920px] grid-cols-[minmax(0,20%)_minmax(0,80%)] gap-3 px-3 py-3 md:gap-3 md:px-4 md:py-3";

  return (
    <div className={gridClass}>
      <aside className={BUYER_LIVE_DESKTOP_COL}>
        {hostStrip}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{chat}</div>
      </aside>

      <main className={`${BUYER_LIVE_DESKTOP_COL} gap-2 p-2`}>
        {hostBanner ? <div className="shrink-0">{hostBanner}</div> : null}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black/40">
          {video}
        </div>
        <div className="shrink-0">{commerce}</div>
      </main>

      {lineup ? <aside className={BUYER_LIVE_DESKTOP_COL}>{lineup}</aside> : null}
    </div>
  );
}
