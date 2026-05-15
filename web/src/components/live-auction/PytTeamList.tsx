"use client";

import type { PytTeam } from "@/components/live-auction/pyt-team";

type PytTeamListProps = {
  teams: PytTeam[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export function PytTeamList({ teams, selectedId, onSelect }: PytTeamListProps) {
  return (
    <div className="min-h-0 flex-1 space-y-2 pr-1">
      {teams.map((team) => {
        const selected = team.id === selectedId;
        return (
          <button
            key={team.id}
            type="button"
            onClick={() => onSelect(team.id)}
            className={`flex w-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition ${
              selected
                ? "border-[#facc15] bg-zinc-900/90 shadow-[0_0_0_1px_rgba(250,204,21,0.25),0_12px_40px_-16px_rgba(250,204,21,0.12)]"
                : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/50"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className={`text-sm font-bold ${selected ? "text-[#facc15]" : "text-zinc-100"}`}>{team.name}</span>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                {team.hot && team.bids >= 3 ? (
                  <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-orange-300">
                    Active interest
                  </span>
                ) : null}
                {team.available ? (
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-400">
                    Available
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-mono font-semibold tabular-nums text-zinc-300">${team.price}</span>
              <span className="text-zinc-500">
                <span className="font-semibold text-zinc-400">{team.bids}</span> bids
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
