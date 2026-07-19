"use client";

import type { LiveShowFeeTierSnapshot } from "@/lib/platform-fee-policy";
import type { LiveShowSellerSummaryDTO } from "@/lib/live-show-seller-summary";
import { centsToUsd } from "@/lib/live-show-seller-summary";

function fmtUsdExact(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtFeePercent(pct: number) {
  return `${pct.toFixed(2).replace(/\.00$/, "")}%`;
}

type Props = {
  tier?: LiveShowFeeTierSnapshot | null;
  summary?: LiveShowSellerSummaryDTO | null;
};

/**
 * Per-sale fee tier (behavior A): rate for the *next* sale is based on completed show GMV so far.
 * Does not retroactively reprice earlier orders.
 */
export function LiveShowFeeTierTile({ tier, summary }: Props) {
  const snap = summary?.feeTier ?? tier;
  if (!snap) return null;

  const pctLabel = fmtFeePercent(snap.currentFeePercent);
  const untilNextUsd =
    summary?.amountUntilNextTierCents != null
      ? centsToUsd(summary.amountUntilNextTierCents)
      : snap.usdToNextTier;
  const nextPct = snap.nextTierFeePercent;
  const progressPct =
    summary != null
      ? summary.tierProgressPercent
      : snap.nextTierThresholdUsd != null && snap.nextTierThresholdUsd > 0
        ? Math.min(100, (snap.completedGmvUsd / snap.nextTierThresholdUsd) * 100)
        : 100;

  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-950/20 px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-amber-200/80">
        Current platform fee tier
      </p>
      <p className="mt-1 font-mono text-lg font-black text-amber-100">{pctLabel}</p>
      <p className="mt-0.5 text-[10px] text-zinc-400">
        Next sale fee: {pctLabel}
        {untilNextUsd != null && nextPct != null ? (
          <>
            {" "}
            · {fmtUsdExact(untilNextUsd)} until {fmtFeePercent(nextPct)}
          </>
        ) : (
          " · top tier unlocked"
        )}
      </p>
      {snap.nextTierThresholdUsd != null ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500/80 to-amber-300/90 transition-[width] duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
