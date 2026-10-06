"use client";

import { useEffect, useRef } from "react";
import {
  formatLiveWinnerAnnouncement,
  soldCelebrationDismissKey,
  SOLD_CELEBRATION_DISPLAY_MS,
  type LiveAuctionCloseCelebration,
} from "@/lib/live-auction-winner-display";

type Props = {
  celebration: LiveAuctionCloseCelebration | null;
  onDone: () => void;
  viewerRole?: "buyer" | "seller";
};

const DISPLAY_MS = SOLD_CELEBRATION_DISPLAY_MS;

/** Minimal winner flash — no backdrop card, room-wide "@user won (item)". */
export function LiveAuctionSoldCelebration({ celebration, onDone }: Props) {
  const onDoneRef = useRef(onDone);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const dismissKey =
    celebration?.kind === "sold" ? soldCelebrationDismissKey(celebration) : null;

  useEffect(() => {
    if (!dismissKey) {
      shownAtRef.current = null;
      return undefined;
    }

    shownAtRef.current = Date.now();
    const id = window.setTimeout(() => onDoneRef.current(), DISPLAY_MS);

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || shownAtRef.current == null) return;
      if (Date.now() - shownAtRef.current >= DISPLAY_MS) {
        onDoneRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [dismissKey]);

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
