"use client";

import { useEffect } from "react";
import { formatAuctionMoneyUsd } from "@/lib/live-auction-winner-display";
import {
  spotCelebrationHeadline,
  SPOT_CELEBRATION_DISPLAY_MS,
  type LiveSpotTakenCelebration,
} from "@/lib/live-spot-celebration";

type Props = {
  celebration: LiveSpotTakenCelebration | null;
  onDone: () => void;
};

const DISPLAY_MS = SPOT_CELEBRATION_DISPLAY_MS;

/** Full-screen PYT spot purchase / auction win announcement. */
export function LiveSpotTakenCelebration({ celebration, onDone }: Props) {
  useEffect(() => {
    if (!celebration) return undefined;
    const id = window.setTimeout(onDone, DISPLAY_MS);
    return () => window.clearTimeout(id);
  }, [celebration, onDone]);

  if (!celebration) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[81] flex items-center justify-center bg-black/55 px-6 backdrop-blur-[2px]"
      role="status"
      aria-live="assertive"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-amber-400/35 bg-gradient-to-b from-zinc-950/95 via-zinc-900/95 to-black/95 px-8 py-10 text-center shadow-[0_0_80px_-20px_rgba(212,175,55,0.75)]">
        <p className="font-display text-4xl font-black uppercase tracking-[0.08em] text-amber-300 sm:text-5xl">
          {spotCelebrationHeadline(celebration.kind)}
        </p>
        <p className="mt-4 text-lg font-bold text-white">
          <span className="text-amber-200">@{celebration.username}</span>
        </p>
        <p className="mt-2 text-base font-semibold text-zinc-100">{celebration.label}</p>
        {celebration.amountUsd > 0 ? (
          <p className="mt-3 font-mono text-2xl font-black tabular-nums text-emerald-300">
            {formatAuctionMoneyUsd(celebration.amountUsd)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
