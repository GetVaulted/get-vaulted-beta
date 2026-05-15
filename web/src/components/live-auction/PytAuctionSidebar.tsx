"use client";

import { useEffect, useMemo, useState } from "react";
import type { PytTeam } from "@/components/live-auction/pyt-team";
import { PytBidPanel } from "@/components/live-auction/PytBidPanel";
import { PytTeamList } from "@/components/live-auction/PytTeamList";

type PytAuctionSidebarProps = {
  teams: PytTeam[];
  onTeamsChange: (teams: PytTeam[]) => void;
};

function formatCountdown(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function PytAuctionSidebar({ teams, onTeamsChange }: PytAuctionSidebarProps) {
  const [selectedId, setSelectedId] = useState(teams[0]?.id ?? "");
  const [bidAmount, setBidAmount] = useState(() => (teams[0]?.price ?? 0) + 1);
  const [secondsLeft, setSecondsLeft] = useState(134); // 02:14

  const selected = useMemo(() => teams.find((t) => t.id === selectedId), [teams, selectedId]);
  const selectedPrice = selected?.price ?? 0;

  const teamsTotal = Math.max(1, teams.length);
  const teamsClaimedDisplay = teams.filter((t) => t.available !== true).length;

  useEffect(() => {
    setBidAmount(selectedPrice + 1);
  }, [selectedId, selectedPrice]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const fillRatio = teamsTotal > 0 ? Math.min(1, teamsClaimedDisplay / teamsTotal) : 0;

  const handlePlaceBid = () => {
    if (!selected) return;
    const next = Math.max(bidAmount, selected.price + 1);
    onTeamsChange(
      teams.map((t) =>
        t.id === selectedId ? { ...t, price: next, bids: t.bids + 1, available: false, hot: t.hot || next >= 50 } : t,
      ),
    );
    setBidAmount(next + 1);
  };

  const handleIncrement = (delta: number) => {
    setBidAmount((v) => v + delta);
  };

  return (
    <aside className="flex min-h-0 flex-col gap-3 border-zinc-800 bg-black p-4 lg:border-l lg:pl-5">
      <div className="shrink-0 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-[#facc15]">PYT Auction</h2>
            <p className="mt-1 text-xs text-zinc-500">Pick your team · live bidding</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-black px-2.5 py-1.5 text-center">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Ends in</p>
            <p className="font-mono text-sm font-black tabular-nums text-white">{formatCountdown(secondsLeft)}</p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-400">Teams claimed</span>
            <span className="font-mono font-bold tabular-nums text-zinc-200">
              <span className="text-[#facc15]">{teamsClaimedDisplay}</span>
              <span className="text-zinc-600"> / </span>
              {teamsTotal}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#ca8a04] via-[#facc15] to-[#fde047] transition-[width] duration-700 ease-out"
              style={{ width: `${fillRatio * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <p className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Teams</p>
        <PytTeamList teams={teams} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      <div className="shrink-0">
        <PytBidPanel
          team={selected}
          bidAmount={bidAmount}
          onBidAmountChange={setBidAmount}
          onIncrement={handleIncrement}
          onPlaceBid={handlePlaceBid}
        />
      </div>
    </aside>
  );
}
