"use client";

import type { ReactNode } from "react";
import {
  BUYER_LIVE_CHAT_COL,
  BUYER_LIVE_DESKTOP_GRID,
  BUYER_LIVE_ITEM_COL,
  BUYER_LIVE_VIDEO_COL,
} from "@/components/live-auction/buyer/buyerLiveLayout";

export type BuyerLiveDesktopShellProps = {
  hostStrip: ReactNode;
  chat: ReactNode;
  video: ReactNode;
  /** Right column: active item, bids, queue (buyers only). */
  itemBoard?: ReactNode;
  hostBanner?: ReactNode;
};

/**
 * Desktop buyer live layout (≥1280px): 20% chat · 60% video board · 20% item board.
 * Seller console does not use this shell.
 */
export function BuyerLiveDesktopShell({
  hostStrip,
  chat,
  video,
  itemBoard,
  hostBanner,
}: BuyerLiveDesktopShellProps) {
  /** Buyers always pass `itemBoard` (empty queue keeps the 20-60-20 grid). Hosts omit it → 20-80. */
  const gridClass = itemBoard
    ? BUYER_LIVE_DESKTOP_GRID
    : "grid h-full min-h-0 w-full max-w-[1920px] grid-cols-[minmax(0,2fr)_minmax(0,8fr)] gap-2 px-2 py-2 md:gap-2 md:px-3 md:py-2";

  return (
    <div className={gridClass}>
      <aside className={BUYER_LIVE_CHAT_COL}>
        {hostStrip}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{chat}</div>
      </aside>

      <main className={`${BUYER_LIVE_VIDEO_COL} min-h-0 gap-0`}>
        {hostBanner ? <div className="shrink-0 border-b border-zinc-800/80 px-2 py-1.5">{hostBanner}</div> : null}
        <div className="relative min-h-0 flex-1 overflow-hidden [container-type:size]">{video}</div>
      </main>

      {itemBoard ? <aside className={BUYER_LIVE_ITEM_COL}>{itemBoard}</aside> : null}
    </div>
  );
}
