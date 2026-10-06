"use client";

import type { TeamBoardLeagueKey } from "@/lib/team-board-sets";
import { TEAM_BOARD_SETS } from "@/lib/team-board-sets";

function TeamBoardGridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.25" stroke="currentColor" strokeWidth="1.65" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.25" stroke="currentColor" strokeWidth="1.65" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.25" stroke="currentColor" strokeWidth="1.65" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.25" stroke="currentColor" strokeWidth="1.65" />
    </svg>
  );
}

export type TeamBoardChromeButtonProps = {
  league: string;
  boardVisible: boolean;
  disabled: boolean;
  onPress: () => void;
  /** When loaded, includes optional MISC tile for NFL. */
  tileCount?: number;
};

export function TeamBoardChromeButton(props: TeamBoardChromeButtonProps) {
  const lg = props.league.toLowerCase();
  const leagueKey: TeamBoardLeagueKey =
    lg === "nfl" || lg === "mlb" || lg === "nhl" || lg === "nba" ? lg : "nba";
  const tileCount = props.tileCount ?? TEAM_BOARD_SETS[leagueKey].length;
  const leagueLabel =
    leagueKey === "nfl" ? "NFL" : leagueKey === "mlb" ? "MLB" : leagueKey === "nhl" ? "NHL" : "NBA";
  const boardHint = `${leagueLabel} · ${tileCount} teams`;

  return (
    <button
      type="button"
      aria-label={
        props.boardVisible ? `Hide team board (${boardHint})` : `Show team board (${boardHint})`
      }
      title={boardHint}
      disabled={props.disabled}
      onClick={props.onPress}
      className={`inline-flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl border bg-black/55 px-2.5 py-2 shadow-sm transition hover:bg-black/75 disabled:opacity-40 ${
        props.boardVisible ? "border-gold/55 ring-1 ring-gold/25" : "border-white/18"
      }`}
    >
      <span className="shrink-0 text-gold-bright">
        <TeamBoardGridIcon className="size-[18px]" />
      </span>
      <span className="text-[9px] font-bold tracking-wide text-zinc-200">Teams</span>
    </button>
  );
}
