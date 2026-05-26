"use client";

import { useEffect } from "react";
import type { LiveAuctionCloseCelebration } from "@/lib/live-auction-winner-display";
import { formatAuctionMoneyUsd } from "@/lib/live-auction-winner-display";

type Props = {
  celebration: LiveAuctionCloseCelebration | null;
  onDone: () => void;
};

const DISPLAY_MS = 2800;

/** Full-screen sold / no-bid celebration overlay (server-confirmed winner only). */
export function LiveAuctionSoldCelebration({ celebration, onDone }: Props) {
  useEffect(() => {
    if (!celebration) return undefined;
    const id = window.setTimeout(onDone, DISPLAY_MS);
    return () => window.clearTimeout(id);
  }, [celebration, onDone]);

  if (!celebration) return null;

  const sold = celebration.kind === "sold";

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-6 backdrop-blur-[2px]"
      role="status"
      aria-live="assertive"
    >
      <div className="live-auction-sold-burst relative w-full max-w-md rounded-3xl border border-amber-400/35 bg-gradient-to-b from-zinc-950/95 via-zinc-900/95 to-black/95 px-8 py-10 text-center shadow-[0_0_80px_-20px_rgba(212,175,55,0.75)]">
        <div className="live-auction-sold-sparkle pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden />
        <p className="live-auction-sold-title font-display text-4xl font-black uppercase tracking-[0.08em] text-amber-300 sm:text-5xl">
          {sold ? "SOLD!" : "Auction ended"}
        </p>
        {sold ? (
          <>
            <p className="mt-4 text-lg font-bold text-white">
              Winner: <span className="text-amber-200">@{celebration.winnerUsername}</span>
            </p>
            <p className="mt-2 font-mono text-2xl font-black tabular-nums text-emerald-300">
              {formatAuctionMoneyUsd(celebration.winningAmountUsd)}
            </p>
          </>
        ) : (
          <p className="mt-4 text-base font-semibold text-zinc-300">No bids</p>
        )}
      </div>
    </div>
  );
}
