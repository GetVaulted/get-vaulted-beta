"use client";

import { useEffect } from "react";
import { formatLiveWinnerAnnouncement, type LiveAuctionCloseCelebration } from "@/lib/live-auction-winner-display";

type Props = {
  celebration: LiveAuctionCloseCelebration | null;
  onDone: () => void;
  viewerRole?: "buyer" | "seller";
};

const DISPLAY_MS = 2800;

/** Minimal winner flash — no backdrop card, room-wide "@user won (item)". */
export function LiveAuctionSoldCelebration({ celebration, onDone }: Props) {
  useEffect(() => {
    if (!celebration || celebration.kind !== "sold") return undefined;
    const id = window.setTimeout(onDone, DISPLAY_MS);
    return () => window.clearTimeout(id);
  }, [celebration, onDone]);

  if (!celebration || celebration.kind !== "sold") return null;

  const label = celebration.itemTitle?.trim() || "Item";
  const line = formatLiveWinnerAnnouncement(celebration.winnerUsername, label);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center px-6"
      role="status"
      aria-live="assertive"
    >
      <p className="text-center text-xl font-black text-amber-300 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-2xl">
        {line}
      </p>
    </div>
  );
}
