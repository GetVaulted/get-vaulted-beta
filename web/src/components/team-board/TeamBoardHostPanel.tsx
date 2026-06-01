"use client";

import type { ReactNode } from "react";
import { TeamBoardChromeButton } from "@/components/team-board/TeamBoardChromeButton";

export function TeamBoardHostPanel({
  league,
  tileCount,
  collapsed,
  disabled,
  onToggleCollapsed,
  onExpandCollapsed,
  onClose,
  children,
}: {
  league: string;
  tileCount?: number;
  collapsed: boolean;
  disabled?: boolean;
  /** Minimize to chip. */
  onToggleCollapsed: () => void;
  /** Restore panel from chip. */
  onExpandCollapsed: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  if (collapsed) {
    return (
      <div className="px-2 pb-2">
        <TeamBoardChromeButton
          league={league}
          tileCount={tileCount}
          boardVisible
          disabled={Boolean(disabled)}
          onPress={onExpandCollapsed}
        />
      </div>
    );
  }

  return (
    <div className="mx-2 mb-2 flex min-h-0 max-h-[min(52vh,440px)] w-[min(100%,360px)] min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] px-2.5 py-2">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold-bright/90">Team board</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Minimize team board"
            title="Minimize"
            disabled={disabled}
            onClick={onToggleCollapsed}
            className="inline-flex size-7 items-center justify-center rounded-lg border border-white/12 text-xs font-bold text-zinc-300 hover:bg-white/[0.06] disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Close team board"
            title="Close"
            disabled={disabled}
            onClick={onClose}
            className="inline-flex size-7 items-center justify-center rounded-lg border border-white/12 text-xs font-bold text-zinc-300 hover:bg-white/[0.06] disabled:opacity-40"
          >
            ×
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto p-2">{children}</div>
    </div>
  );
}
