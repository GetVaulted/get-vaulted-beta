"use client";

import type { ReactNode } from "react";

export type BuyerLiveItemBoardOverlayProps = {
  /** Mobile-style glass sheet content (active lot, bids, waiting copy). */
  commerce: ReactNode | null;
};

/** Floating item board on the video stage — matches mobile bottom sheet; actions use the stage rail. */
export function BuyerLiveItemBoardOverlay({ commerce }: BuyerLiveItemBoardOverlayProps) {
  if (!commerce) return null;

  return (
    <div className="pointer-events-auto w-full motion-reduce:animate-none [animation:live-stage-mobile-in_var(--live-duration-enter)_var(--live-ease)_both] motion-reduce:[animation:none]">
      {commerce}
    </div>
  );
}
