"use client";

import Link from "next/link";

export type BuyerLiveNextUpRailProps = {
  nextTitle: string;
  nextMeta: string;
  queueCount: number;
  shopHref?: string | null;
  onOpenQueue: () => void;
};

/** Compact buyer “next up” bar — full lineup opens in `BuyerLiveQueueSheet`. */
export function BuyerLiveNextUpRail({
  nextTitle,
  nextMeta,
  queueCount,
  shopHref,
  onOpenQueue,
}: BuyerLiveNextUpRailProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/75 px-2.5 py-2 backdrop-blur-sm">
      <button
        type="button"
        onClick={onOpenQueue}
        className="min-w-0 flex-1 text-left transition hover:opacity-90"
        aria-label={`Open lineup, ${queueCount} items`}
      >
        <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Next up</p>
        <p className="line-clamp-1 text-sm font-semibold text-zinc-100">{nextTitle}</p>
        <p className="line-clamp-1 text-[11px] font-medium text-zinc-400">{nextMeta}</p>
      </button>
      <button
        type="button"
        onClick={onOpenQueue}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-100 transition hover:border-gold/40 hover:bg-zinc-800"
      >
        Lineup
        <span className="rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-black text-black">{queueCount}</span>
      </button>
      {shopHref ? (
        <Link
          href={shopHref}
          className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gold-bright sm:inline hover:underline"
        >
          Shop
        </Link>
      ) : null}
    </div>
  );
}
