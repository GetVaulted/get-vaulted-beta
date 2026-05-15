"use client";

import { useEffect, useRef, useState } from "react";

function formatInt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${n}`;
}

type LiveViewerCountProps = {
  viewers: number;
  isLive: boolean;
};

/** Subtle pop when the audience count changes — live-energy without distraction. */
export function LiveViewerCount({ viewers, isLive }: LiveViewerCountProps) {
  const [display, setDisplay] = useState(viewers);
  const [nudge, setNudge] = useState(false);
  const prevRef = useRef(viewers);

  useEffect(() => {
    if (viewers === prevRef.current) return;
    prevRef.current = viewers;
    setDisplay(viewers);
    setNudge(true);
    const id = window.setTimeout(() => setNudge(false), 420);
    return () => window.clearTimeout(id);
  }, [viewers]);

  const audienceLabel = `${formatInt(display)} ${isLive ? "watching" : "waiting"}`;

  return (
    <span
      data-testid="live-viewer-count"
      className={`inline-flex h-[22px] min-w-[2.85rem] items-center justify-center rounded-full bg-black/18 px-1.5 py-0 text-[6px] font-semibold tabular-nums text-zinc-400 transition-transform duration-[var(--live-duration-ui)] ease-[var(--live-ease)] motion-reduce:transition-none ${
        nudge ? "motion-reduce:scale-100 origin-center scale-[1.05] text-zinc-200/95" : ""
      }`}
    >
      {audienceLabel}
    </span>
  );
}
