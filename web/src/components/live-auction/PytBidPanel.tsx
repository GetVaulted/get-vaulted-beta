"use client";

import type { PytTeam } from "@/components/live-auction/pyt-team";

type PytBidPanelProps = {
  team: PytTeam | undefined;
  bidAmount: number;
  onBidAmountChange: (value: number) => void;
  onIncrement: (delta: number) => void;
  onPlaceBid: () => void;
};

export function PytBidPanel({ team, bidAmount, onBidAmountChange, onIncrement, onPlaceBid }: PytBidPanelProps) {
  if (!team) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-center text-sm text-zinc-500">
        Select a team to bid
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/90 to-black p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Selected team</p>
      <p className="mt-1 text-lg font-black text-white">{team.name}</p>
      <div className="mt-3 flex items-baseline justify-between border-t border-zinc-800 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Top bid</span>
        <span className="font-mono text-2xl font-black tabular-nums text-[#facc15]">${team.price}</span>
      </div>

      <label htmlFor="bid-input" className="mt-4 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        Your bid
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="bid-input"
          type="number"
          min={1}
          value={bidAmount}
          onChange={(e) => onBidAmountChange(Number(e.target.value) || 0)}
          className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black px-3 py-2.5 font-mono text-sm font-semibold tabular-nums text-zinc-100 outline-none focus:border-[#facc15]/50 focus:ring-2 focus:ring-[#facc15]/20"
        />
        <div className="flex shrink-0 gap-1">
          {([1, 5, 10] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onIncrement(n)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-[11px] font-bold text-zinc-300 transition hover:border-[#facc15]/40 hover:text-[#facc15]"
            >
              +{n}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onPlaceBid}
        className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#eab308] via-[#facc15] to-[#fde047] py-3.5 text-sm font-black uppercase tracking-wide text-zinc-950 shadow-[0_0_32px_-8px_rgba(250,204,21,0.45)] transition hover:brightness-105 active:scale-[0.99]"
      >
        Place Bid
      </button>
    </div>
  );
}
