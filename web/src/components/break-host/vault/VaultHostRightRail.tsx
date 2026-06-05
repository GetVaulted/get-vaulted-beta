"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type VaultHostRightRailProps = {
  roomId: string;
  onOpenCommandCenter: () => void;
  onOpenLineup?: () => void;
  lineupCount?: number;
  onOpenObs: () => void;
  disabled?: boolean;
};

function RailBtn({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="group inline-flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-[var(--live-radius-chrome)] border border-[color:var(--live-border)] bg-black/35 px-0.5 py-1.5 text-white/90 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.85)] backdrop-blur-[var(--live-blur-xl)] transition-[transform,background-color,box-shadow] duration-[var(--live-duration-press)] ease-[var(--live-ease)] hover:-translate-y-0.5 hover:border-amber-400/25 hover:bg-amber-500/10 active:scale-[0.94] disabled:opacity-35 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 md:min-h-12 md:min-w-12 md:px-1 md:py-2"
    >
      <span className="inline-flex size-[18px] items-center justify-center text-amber-100/95 md:size-5">{children}</span>
      <span className="max-w-[3.25rem] truncate text-[8px] font-semibold leading-none text-zinc-300 group-hover:text-zinc-100">
        {label}
      </span>
    </button>
  );
}

export function VaultHostRightRail({
  roomId,
  onOpenCommandCenter,
  onOpenLineup,
  lineupCount = 0,
  onOpenObs,
  disabled,
}: VaultHostRightRailProps) {
  return (
    <div className="motion-reduce:animate-none flex flex-col items-center gap-1 max-[380px]:gap-0.5 rounded-2xl border border-[color:var(--live-border)] bg-black/22 px-1 py-1.5 shadow-[var(--live-shadow-rail)] backdrop-blur-[var(--live-blur-xl)] [animation:live-rail-in_var(--live-duration-enter)_var(--live-ease)_both] motion-reduce:[animation:none] md:gap-1.5 md:px-1.5 md:py-2">
      <RailBtn label={onOpenLineup ? `Lineup${lineupCount > 0 ? ` (${lineupCount})` : ""}` : "Vault"} disabled={disabled} onClick={onOpenLineup ?? onOpenCommandCenter}>
        <svg viewBox="0 0 24 24" fill="none" className="size-[18px] md:size-5" aria-hidden>
          <path
            d="M12 3l7 4v6c0 4-3 7-7 9-4-2-7-5-7-9V7l7-4z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M9.5 12.5l1.75 1.75L15 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </RailBtn>
      <RailBtn label="OBS" disabled={disabled} onClick={onOpenObs}>
        <svg viewBox="0 0 24 24" fill="none" className="size-[18px] md:size-5" aria-hidden>
          <path
            d="M4 8.5L12 4l8 4.5v7L12 20l-8-4.5v-7z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M9.5 9.5v5L12 16l2.5-1.5v-5L12 8l-2.5 1.5z" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </RailBtn>
      <Link
        href={`/live/${encodeURIComponent(roomId)}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Open public room"
        className="group inline-flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-[var(--live-radius-chrome)] border border-[color:var(--live-border)] bg-black/35 px-0.5 py-1.5 text-white/90 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.85)] backdrop-blur-[var(--live-blur-xl)] transition-[transform,background-color] duration-[var(--live-duration-press)] ease-[var(--live-ease)] hover:-translate-y-0.5 hover:border-sky-400/25 hover:bg-sky-500/10 active:scale-[0.94] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 md:min-h-12 md:min-w-12 md:px-1 md:py-2"
      >
        <span className="inline-flex size-[18px] items-center justify-center text-sky-200/95 md:size-5">
          <svg viewBox="0 0 24 24" fill="none" className="size-[18px] md:size-5" aria-hidden>
            <path
              d="M14 3h4v4M10 14L21 3M18 13v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="max-w-[3.25rem] truncate text-[8px] font-semibold leading-none text-zinc-300 group-hover:text-zinc-100">
          Room
        </span>
      </Link>
    </div>
  );
}
