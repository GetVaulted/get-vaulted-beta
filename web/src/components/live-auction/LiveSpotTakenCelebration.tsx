"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatSpotCelebrationAccessibility,
  formatSpotCelebrationPrice,
  isSpotCelebrationViewerWinner,
  spotCelebrationDismissKey,
  spotCelebrationHeadline,
  spotCelebrationKicker,
  spotCelebrationTagline,
  SPOT_CELEBRATION_DISPLAY_MS,
  type LiveSpotTakenCelebration,
} from "@/lib/live-spot-celebration";

type Props = {
  celebration: LiveSpotTakenCelebration | null;
  onDone: () => void;
  viewerUsername?: string | null;
};

const DISPLAY_MS = SPOT_CELEBRATION_DISPLAY_MS;

/** PYT/PYD spot win — full-screen hype card with claim gradient + price. */
export function LiveSpotTakenCelebration({ celebration, onDone, viewerUsername }: Props) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const onDoneRef = useRef(onDone);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismissKey = celebration ? spotCelebrationDismissKey(celebration) : null;
  const viewerIsWinner = celebration ? isSpotCelebrationViewerWinner(celebration, viewerUsername) : false;

  useEffect(() => {
    if (!dismissKey) {
      shownAtRef.current = null;
      setEntered(false);
      return undefined;
    }

    shownAtRef.current = Date.now();
    setEntered(false);
    const raf = window.requestAnimationFrame(() => setEntered(true));

    const id = window.setTimeout(() => onDoneRef.current(), DISPLAY_MS);

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || shownAtRef.current == null) return;
      if (Date.now() - shownAtRef.current >= DISPLAY_MS) {
        onDoneRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [dismissKey]);

  if (!celebration || !mounted) return null;

  const headline = spotCelebrationHeadline(celebration.kind, { viewerIsWinner });
  const price = formatSpotCelebrationPrice(celebration.amountUsd);
  const accessibilityLabel = formatSpotCelebrationAccessibility(celebration, { viewerIsWinner });

  return createPortal(
    <div
      className={`pointer-events-none fixed inset-0 z-[130] flex items-center justify-center bg-black/55 px-6 transition-opacity duration-200 ${
        entered ? "opacity-100" : "opacity-0"
      }`}
      role="status"
      aria-live="assertive"
      aria-label={accessibilityLabel}
    >
      <div
        className={`relative w-full max-w-[360px] transition-all duration-300 ease-out ${
          entered ? "scale-100 opacity-100" : "scale-[0.88] opacity-0"
        }`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/20 blur-3xl"
        />
        <div className="relative rounded-2xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-indigo-500 p-[2px] shadow-[0_0_40px_rgba(217,70,239,0.25)]">
          <div className="rounded-[14px] bg-[#0c0c0e] px-6 py-6 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">
              {spotCelebrationKicker(celebration.kind)}
            </p>
            <p className="mt-2 text-3xl font-black tracking-wide text-white drop-shadow-[0_0_16px_rgba(217,70,239,0.35)] sm:text-4xl">
              {headline}
            </p>
            <p className="mt-4 text-xl font-extrabold text-amber-300 sm:text-2xl">{celebration.label}</p>
            {!viewerIsWinner ? (
              <p className="mt-1 text-sm font-bold text-zinc-400">@{celebration.username}</p>
            ) : null}
            {price ? <p className="mt-3 text-2xl font-black text-emerald-400 sm:text-3xl">{price}</p> : null}
            <p className="mt-4 text-xs font-semibold text-zinc-500">{spotCelebrationTagline(celebration.kind)}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
