"use client";

import type { LiveShowFeeTierSnapshot } from "@/lib/platform-fee-policy";

function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function LiveShowFeeTierTile({ tier }: { tier: LiveShowFeeTierSnapshot | null | undefined }) {
  if (!tier) return null;

  const pctLabel = `${tier.currentFeePercent.toFixed(2).replace(/\.00$/, "")}%`;
  const progressPct =
    tier.nextTierThresholdUsd != null && tier.nextTierThresholdUsd > 0
      ? Math.min(100, (tier.completedGmvUsd / tier.nextTierThresholdUsd) * 100)
      : 100;

  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-950/20 px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-amber-200/80">Platform fee tier</p>
      <p className="mt-1 font-mono text-lg font-black text-amber-100">{pctLabel}</p>
      <p className="mt-0.5 text-[10px] text-zinc-400">
        Show volume {fmtUsd(tier.completedGmvUsd)}
        {tier.usdToNextTier != null && tier.nextTierFeePercent != null ? (
          <>
            {" "}
            · {fmtUsd(tier.usdToNextTier)} to {tier.nextTierFeePercent}% tier
          </>
        ) : (
          " · top tier unlocked"
        )}
      </p>
      {tier.nextTierThresholdUsd != null ? (
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
