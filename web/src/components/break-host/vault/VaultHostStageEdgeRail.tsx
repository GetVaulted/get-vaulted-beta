"use client";

import Link from "next/link";
import type { ReactNode } from "react";

function EdgeBtn({
  label,
  onClick,
  children,
  disabled,
  href,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
  href?: string;
}) {
  const className =
    "group inline-flex size-9 flex-col items-center justify-center rounded-full border border-white/[0.14] bg-black/60 text-white/90 shadow-[0_6px_20px_-10px_rgba(0,0,0,0.9)] backdrop-blur-md transition hover:border-amber-400/30 hover:bg-black/75 active:scale-95 disabled:opacity-35";

  if (href && !disabled) {
    return (
      <Link href={href} target="_blank" rel="noreferrer" aria-label={label} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className={className}>
      {children}
    </button>
  );
}

type VaultHostStageEdgeRailProps = {
  roomId: string;
  disabled?: boolean;
  onOpenCommandCenter: () => void;
  onOpenObs: () => void;
  onShare: () => void;
  onToggleMute: () => void;
  muted: boolean;
};

export function VaultHostStageEdgeRail({
  roomId,
  disabled,
  onOpenCommandCenter,
  onOpenObs,
  onShare,
  onToggleMute,
  muted,
}: VaultHostStageEdgeRailProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-1">
      <EdgeBtn label={muted ? "Unmute stream" : "Mute stream"} onClick={onToggleMute} disabled={disabled}>
        {muted ? (
          <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden>
            <path d="M11 5L6 9H3v6h3l5 4V5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M16 9l4 4M20 9l-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden>
            <path d="M11 5L6 9H3v6h3l5 4V5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M15.5 8.5a5 5 0 010 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </EdgeBtn>
      <EdgeBtn label="Share room" onClick={onShare} disabled={disabled}>
        <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden>
          <path stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M7 12v6a1 1 0 001 1h8a1 1 0 001-1v-6" />
          <path stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 0l-3 3m3-3l3 3" />
        </svg>
      </EdgeBtn>
      <EdgeBtn label="Vault controls" onClick={onOpenCommandCenter} disabled={disabled}>
        <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden>
          <path d="M12 3l7 4v6c0 4-3 7-7 9-4-2-7-5-7-9V7l7-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </EdgeBtn>
      <EdgeBtn label="OBS setup" onClick={onOpenObs} disabled={disabled}>
        <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden>
          <path d="M4 8.5L12 4l8 4.5v7L12 20l-8-4.5v-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </EdgeBtn>
      <EdgeBtn label="Open public room" href={`/live/${encodeURIComponent(roomId)}`}>
        <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden>
          <path
            d="M14 3h4v4M10 14L21 3M18 13v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </EdgeBtn>
    </div>
  );
}
