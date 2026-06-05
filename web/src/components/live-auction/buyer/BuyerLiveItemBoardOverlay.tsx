"use client";

import type { ReactNode } from "react";
import { BuyerLiveDesktopCommerce } from "@/components/live-auction/buyer/BuyerLiveDesktopCommerce";

export type BuyerLiveItemBoardOverlayProps = {
  /** Active lot, bid controls, waiting copy. */
  commerce: ReactNode | null;
  /** Tip / share / wallet / shop / report rail. */
  actions: ReactNode;
};

/** Floating item board on the video stage — commerce + action rail, layout unchanged. */
export function BuyerLiveItemBoardOverlay({ commerce, actions }: BuyerLiveItemBoardOverlayProps) {
  return (
    <div className="live-glass-sheet flex w-full items-stretch gap-2 border-t border-white/[0.08] bg-black/55 px-2 py-2 backdrop-blur-[var(--live-blur-xl)]">
      <div className="min-w-0 flex-1">
        {commerce ? (
          <BuyerLiveDesktopCommerce>{commerce}</BuyerLiveDesktopCommerce>
        ) : (
          <p className="px-1 py-2 text-center text-[11px] text-zinc-500">Waiting for the next item…</p>
        )}
      </div>
      <div className="flex shrink-0 items-center self-center">{actions}</div>
    </div>
  );
}
