"use client";

export type LiveLotTransitionPhase = "idle" | "sold_spotlight" | "next_intro" | "incoming";

type LiveLotTransitionBannerProps = {
  phase: LiveLotTransitionPhase;
  winnerUsername?: string | null;
  soldAmount?: string | null;
  nextItemTitle?: string | null;
};

/** Cinematic inter-lot overlay — sits on stage, not on the 9:16 video plate. */
export function LiveLotTransitionBanner({
  phase,
  winnerUsername,
  soldAmount,
  nextItemTitle,
}: LiveLotTransitionBannerProps) {
  if (phase === "idle") return null;

  if (phase === "sold_spotlight") {
    return (
      <div className="live-lot-transition pointer-events-none absolute inset-x-0 top-[18%] z-[15] flex justify-center px-4 motion-safe:animate-[live-lot-sold-in_0.55s_var(--live-ease)_both]">
        <div className="live-lot-sold-spotlight relative overflow-hidden rounded-3xl px-8 py-5 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-200/80">Sold</p>
          {winnerUsername ? (
            <p className="mt-1 font-display text-2xl font-black text-white">@{winnerUsername}</p>
          ) : null}
          {soldAmount ? (
            <p className="mt-1 font-mono text-lg font-black tabular-nums text-amber-100">{soldAmount}</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (phase === "next_intro") {
    return (
      <div className="live-lot-transition pointer-events-none absolute inset-x-0 top-[22%] z-[15] flex justify-center px-4 motion-safe:animate-[live-lot-next-in_0.5s_var(--live-ease)_both]">
        <p className="text-[11px] font-black uppercase tracking-[0.32em] text-amber-100/90 drop-shadow-[0_0_24px_rgba(251,191,36,0.45)]">
          Next on the block
        </p>
      </div>
    );
  }

  if (phase === "incoming" && nextItemTitle) {
    return (
      <div className="live-lot-transition pointer-events-none absolute inset-x-0 top-[26%] z-[15] flex justify-center px-4 motion-safe:animate-[live-lot-slide-up_0.65s_var(--live-ease)_both]">
        <p className="max-w-md truncate rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md">
          {nextItemTitle}
        </p>
      </div>
    );
  }

  return null;
}
