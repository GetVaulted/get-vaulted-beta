"use client";

import type { TeamBoardPickDTO, TeamBoardStateDTO } from "@/lib/team-board-public";
import { teamBoardDisplayName, teamBoardLeagueKey, teamBoardTableColumnCount } from "@/lib/team-board-sets";
import { teamBoardTileColors } from "@/lib/team-board-team-colors";

type TeamBoardOverlayProps = {
  state: TeamBoardStateDTO;
  picks: TeamBoardPickDTO[];
  teams: readonly string[];
  viewerUserId: string | null;
  isRoomHost: boolean;
  canSelectTiles: boolean;
  busy?: boolean;
  onPick: (teamAbbr: string) => void | Promise<void>;
};

const LEAGUE_LABEL: Record<string, string> = { nfl: "NFL", nba: "NBA", mlb: "MLB" };

function chunkTeams<T>(items: readonly T[], chunkSize: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    rows.push(items.slice(i, i + chunkSize) as T[]);
  }
  return rows;
}

export function TeamBoardOverlay({
  state,
  picks,
  teams,
  viewerUserId,
  isRoomHost,
  canSelectTiles,
  busy = false,
  onPick,
}: TeamBoardOverlayProps) {
  if (!state.visible) return null;

  const teamList = teams ?? [];
  if (teamList.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-500/35 bg-zinc-950/90 p-4 text-center text-sm text-amber-100/95">
        Team list is empty — refresh or check room setup.
      </div>
    );
  }

  const pickByAbbr = new Map(picks.map((p) => [p.teamAbbr, p]));
  const leagueKey = teamBoardLeagueKey(state.league);
  const colCount = teamBoardTableColumnCount(leagueKey);
  const teamRows = chunkTeams(teamList, colCount);

  return (
    <div className="rounded-2xl border border-gold/30 bg-zinc-950/90 p-3 shadow-[0_0_80px_rgba(0,0,0,0.92)] ring-1 ring-white/[0.06] backdrop-blur-md sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-bright/90">Team board</p>
          <p className="text-xs font-bold text-zinc-100">
            {LEAGUE_LABEL[state.league] ?? state.league}
            <span className="ml-1.5 font-mono text-[10px] font-semibold text-zinc-500">
              · {teams.length} teams
            </span>
          </p>
        </div>
        {state.locked ? (
          <span className="rounded-full border border-rose-500/40 bg-rose-950/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-100">
            Locked
          </span>
        ) : null}
      </div>

      {state.currentPickerUsername ? (
        <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-center text-xs font-semibold text-emerald-100">
          <span className="text-emerald-200/90">@{state.currentPickerUsername}</span> is selecting a team
        </p>
      ) : null}

      <div className="mt-3 max-h-[min(52vh,480px)] overflow-y-auto overflow-x-auto pr-0.5">
        <table className="w-full min-w-0 table-fixed border-separate border-spacing-1.5">
          <tbody>
            {teamRows.map((rowAbbrs, ri) => (
              <tr key={ri}>
                {rowAbbrs.map((abbr) => {
                  const row = pickByAbbr.get(abbr);
                  const taken = Boolean(row);
                  const clickable = canSelectTiles && !taken && !state.locked && !busy;
                  const { primary: tilePrimary, secondary: tileSecondary, fg, sub } = teamBoardTileColors(leagueKey, abbr);
                  const ring =
                    clickable || taken
                      ? "rgba(255,255,255,0.14)"
                      : "rgba(255,255,255,0.08)";
                  return (
                    <td key={abbr} className="align-top p-0">
                      <button
                        type="button"
                        disabled={!clickable}
                        onClick={() => void onPick(abbr)}
                        style={{ borderColor: ring }}
                        className={`relative flex min-h-[56px] w-full min-w-0 flex-col overflow-hidden rounded-xl border bg-zinc-900 px-0.5 py-1.5 text-xs font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition sm:min-h-[60px] sm:py-2 sm:text-sm ${
                          taken
                            ? "cursor-not-allowed brightness-[0.72] saturate-[0.85]"
                            : clickable
                              ? "cursor-pointer hover:brightness-110 active:brightness-95"
                              : "cursor-default opacity-90"
                        }`}
                      >
                        {/* Two clip-path halves = vector-sharp diagonal (gradients look soft / “boxy” on small tiles). */}
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] [transform:translate3d(0,0,0)]"
                          style={{
                            backgroundColor: tilePrimary,
                            clipPath: "polygon(0% 0%, 100% 0%, 0% 100%)",
                          }}
                        />
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] [transform:translate3d(0,0,0)]"
                          style={{
                            backgroundColor: tileSecondary,
                            clipPath: "polygon(100% 0%, 100% 100%, 0% 100%)",
                          }}
                        />
                        <span className="relative z-[1] flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5">
                          <span
                            style={{ color: fg }}
                            className={`tabular-nums leading-none ${taken ? "line-through" : ""}`}
                          >
                            {abbr}
                          </span>
                          <span
                            style={{ color: sub }}
                            className="line-clamp-2 max-w-full px-0.5 text-center text-[7px] font-semibold normal-case not-italic leading-snug sm:text-[8px]"
                          >
                            {teamBoardDisplayName(leagueKey, abbr)}
                          </span>
                          {taken && row ? (
                            <span
                              style={{ color: sub }}
                              className="max-w-full truncate px-0.5 text-[7px] font-semibold normal-case not-italic no-underline sm:text-[8px]"
                            >
                              @{row.username}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!canSelectTiles && !isRoomHost && state.visible && !state.locked && viewerUserId && viewerUserId !== state.currentPickerUserId ? (
        <p className="mt-2 text-center text-[10px] text-zinc-500">View only — the winning bidder is picking.</p>
      ) : null}
    </div>
  );
}
