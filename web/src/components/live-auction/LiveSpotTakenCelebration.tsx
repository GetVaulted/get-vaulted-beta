"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatSpotWinnerAnnouncement, SPOT_CELEBRATION_DISPLAY_MS, type LiveSpotTakenCelebration } from "@/lib/live-spot-celebration";

type Props = {
  celebration: LiveSpotTakenCelebration | null;
  onDone: () => void;
};

const DISPLAY_MS = SPOT_CELEBRATION_DISPLAY_MS;

/** PYT/PYD spot win — "@user won (team/division)" with no backdrop card. */
export function LiveSpotTakenCelebration({ celebration, onDone }: Props) {
  const [mounted, setMounted] = useState(false);
  const onDoneRef = useRef(onDone);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismissKey = celebration ? `${celebration.kind}|${celebration.username}|${celebration.label}` : null;

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

  if (!celebration || !mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[130] flex items-center justify-center px-6"
      role="status"
      aria-live="assertive"
    >
      <p className="text-center text-xl font-black text-amber-300 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-2xl">
        {formatSpotWinnerAnnouncement(celebration)}
      </p>
    </div>,
    document.body,
  );
}
