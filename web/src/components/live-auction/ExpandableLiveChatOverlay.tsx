"use client";

import { useState, type ReactNode } from "react";

function ChevronUpIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[2]">
      <path d="M5 12.5 10 7.5 15 12.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[2]">
      <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Floating live chat shell with expand/collapse control for mobile + desktop overlays. */
export function ExpandableLiveChatOverlay({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse chat" : "Expand chat"}
        onClick={() => setExpanded((value) => !value)}
        className="pointer-events-auto absolute -top-9 right-0 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/65"
      >
        {expanded ? <ChevronDownIcon /> : <ChevronUpIcon />}
      </button>
      <div
        className={
          expanded
            ? "flex h-[min(68vh,28rem)] max-h-[min(72dvh,32rem)] min-[768px]:h-[min(72vh,36rem)] min-h-0 w-full flex-col transition-[height,max-height] duration-200 ease-out"
            : "flex h-[min(42vh,19rem)] max-h-[min(50dvh,22rem)] max-[380px]:h-[min(32vh,14rem)] min-[768px]:h-[min(48vh,24rem)] min-h-0 w-full flex-col transition-[height,max-height] duration-200 ease-out"
        }
      >
        {children}
      </div>
    </div>
  );
}
