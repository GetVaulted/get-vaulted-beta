"use client";

import { useEffect, useRef, useState } from "react";
import { centsToUsd, type LiveShowSellerSummaryDTO } from "@/lib/live-show-seller-summary-shared";

function fmtUsdExact(usd: number) {
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function useCountUpCents(targetCents: number, durationMs = 450): number {
  const [displayCents, setDisplayCents] = useState(targetCents);
  const fromRef = useRef(targetCents);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === targetCents) {
      setDisplayCents(targetCents);
      return;
    }
    const started = performance.now();
    const delta = targetCents - from;

    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      const next = Math.round(from + delta * eased);
      setDisplayCents(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = targetCents;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      fromRef.current = targetCents;
    };
  }, [targetCents, durationMs]);

  return displayCents;
}

type Props = {
  summary: LiveShowSellerSummaryDTO | null | undefined;
  loading?: boolean;
  refreshError?: boolean;
};

export function LiveShowSalesTile({ summary, loading, refreshError }: Props) {
  const cents = summary?.grossShowSalesCents ?? 0;
  const paidCount = summary?.paidOrderCount ?? 0;
  const displayCents = useCountUpCents(cents);
  const amountUsd = centsToUsd(displayCents);

  if (loading && !summary) {
    return (
      <div className="rounded-xl border border-emerald-400/15 bg-emerald-950/15 px-3 py-2.5">
        <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-200/70">Show sales</p>
        <div className="mt-2 h-7 w-28 animate-pulse rounded bg-white/[0.06]" />
        <div className="mt-2 h-3 w-36 animate-pulse rounded bg-white/[0.04]" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-400/20 bg-emerald-950/20 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-200/80">Show sales</p>
        {refreshError ? (
          <span className="text-[9px] font-semibold text-amber-200/80">Unable to refresh</span>
        ) : null}
      </div>
      <p className="mt-1 font-mono text-2xl font-black tabular-nums tracking-tight text-emerald-50">
        {fmtUsdExact(amountUsd)}
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-400">
        {paidCount === 0
          ? "Total paid sales during this show"
          : `${paidCount} paid sale${paidCount === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}
