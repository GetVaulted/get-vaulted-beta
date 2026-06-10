"use client";

import { useEffect, useState } from "react";

type ChecklistItem = {
  key: string;
  label: string;
  met: boolean;
  pending?: boolean;
  current?: string;
  required?: string;
};

type PayoutTierPayload = {
  currentTier: string;
  currentTierLabel: string;
  releaseDescription: string;
  sellerLevel: string;
  sellerLevelLabel: string;
  instantApprovalStatus: string;
  instantApprovalLabel: string;
  nextTier: string | null;
  progressChecklist: ChecklistItem[];
  metrics: {
    lifetimeGmvUsd: number;
    completedOrders: number;
    accountStanding: string;
    accountStandingLabel: string;
    accountAgeDays: number;
  };
  suspensionReason: string | null;
  rejectionReason: string | null;
  education: { title: string; body: string };
};

function formatUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function standingColor(label: string) {
  if (label === "Excellent") return "text-emerald-400";
  if (label === "Good") return "text-sky-300";
  if (label === "Needs Attention") return "text-amber-300";
  return "text-rose-300";
}

export function SellerPayoutTierCard() {
  const [data, setData] = useState<PayoutTierPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/account/payout-tier", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as PayoutTierPayload;
        if (!cancelled) setData(j);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0d]/80 p-4 text-xs text-zinc-500">
        Loading payout tier…
      </div>
    );
  }

  if (!data) return null;

  return (
    <section className="rounded-xl border border-gold/20 bg-gradient-to-br from-[#0f0d08] to-[#0a0a0d] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gold-bright/80">Seller program</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-black text-zinc-50">{data.sellerLevelLabel}</h2>
            <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              {data.instantApprovalLabel}
            </span>
          </div>
          <p className="mt-1 max-w-xl text-xs text-zinc-400">{data.releaseDescription}</p>
          <p className="mt-1 text-[10px] text-zinc-500">
            Internal tier: <span className="text-zinc-400">{data.currentTierLabel}</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase text-zinc-500">Lifetime GMV</p>
            <p className="mt-0.5 font-semibold tabular-nums text-zinc-100">{formatUsd(data.metrics.lifetimeGmvUsd)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-zinc-500">Completed orders</p>
            <p className="mt-0.5 font-semibold tabular-nums text-zinc-100">{data.metrics.completedOrders}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-zinc-500">Account standing</p>
            <p className={`mt-0.5 font-semibold ${standingColor(data.metrics.accountStandingLabel)}`}>
              {data.metrics.accountStandingLabel}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-zinc-500">Account age</p>
            <p className="mt-0.5 font-semibold tabular-nums text-zinc-100">{data.metrics.accountAgeDays}d</p>
          </div>
        </div>
      </div>

      {data.suspensionReason ? (
        <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">
          Tier adjustment: {data.suspensionReason.replace(/_/g, " ")}
        </p>
      ) : null}

      {data.rejectionReason ? (
        <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
          Application note: {data.rejectionReason}
        </p>
      ) : null}

      {data.nextTier ? (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            Progress to {data.nextTier}
          </p>
          <ul className="mt-2 space-y-1.5">
            {data.progressChecklist.map((item) => (
              <li key={item.key} className="flex items-start gap-2 text-xs">
                <span className={item.met ? "text-emerald-400" : item.pending ? "text-amber-400" : "text-zinc-600"}>
                  {item.met ? "✓" : item.pending ? "◷" : "○"}
                </span>
                <span className={item.met ? "text-zinc-200" : "text-zinc-400"}>
                  {item.label}
                  {item.current ? (
                    <span className="text-zinc-500">
                      {" "}
                      · {item.current}
                      {item.required ? ` / ${item.required}` : ""}
                    </span>
                  ) : null}
                  {item.pending ? <span className="text-amber-300/90"> — Pending</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">{data.education.body}</p>
    </section>
  );
}
