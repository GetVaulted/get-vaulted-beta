"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export type LiveShippingSessionPayload = {
  shippingCostCents: number;
  pricingWeightOz: number;
  capReached: boolean;
  nextIncrementalCostCents: number | null;
  tierLabel: string | null;
};

function formatUsdFromCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function hasBundledShippingActivity(d: LiveShippingSessionPayload): boolean {
  return d.shippingCostCents > 0 || d.pricingWeightOz > 0;
}

type Props = {
  liveShowId: string;
  /** Bump after bid win / buy-now / checkout return to force refetch. */
  refreshNonce?: number;
  /** Background refresh while on a live page (0 disables). */
  pollMs?: number;
  className?: string;
  /** Dense one-line + subtext for sidebars. */
  compact?: boolean;
  /** Skip network (e.g. host console). */
  disabled?: boolean;
};

export function LiveShippingIndicator({
  liveShowId,
  refreshNonce = 0,
  pollMs = 0,
  className = "",
  compact = false,
  disabled = false,
}: Props) {
  const { status } = useSession();
  const [data, setData] = useState<LiveShippingSessionPayload | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (disabled || !liveShowId.trim()) {
      setData(null);
      return;
    }
    if (status !== "authenticated") {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/live-shipping/session?liveShowId=${encodeURIComponent(liveShowId.trim())}`,
        { cache: "no-store" },
      );
      if (res.status === 401) {
        setData(null);
        return;
      }
      if (!res.ok) {
        setData(null);
        return;
      }
      const j = (await res.json()) as LiveShippingSessionPayload;
      if (
        typeof j.shippingCostCents === "number" &&
        typeof j.pricingWeightOz === "number" &&
        typeof j.capReached === "boolean"
      ) {
        setData(j);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [disabled, liveShowId, status]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  useEffect(() => {
    if (disabled || pollMs <= 0 || status !== "authenticated" || !liveShowId.trim()) return undefined;
    const id = window.setInterval(() => void load(), pollMs);
    return () => window.clearInterval(id);
  }, [disabled, load, liveShowId, pollMs, status]);

  if (disabled) return null;

  if (status === "unauthenticated" || status === "loading") {
    return (
      <div className={`rounded-lg border border-zinc-700/60 bg-zinc-950/50 px-2.5 py-2 text-[10px] text-zinc-500 ${className}`}>
        {status === "loading" ? "Loading shipping info…" : "Sign in to see bundled live shipping."}
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className={`rounded-lg border border-zinc-700/60 bg-zinc-950/50 px-2.5 py-2 text-[10px] text-zinc-500 ${className}`}>
        Loading shipping info…
      </div>
    );
  }

  if (!data || !hasBundledShippingActivity(data)) {
    return (
      <div className={`rounded-lg border border-emerald-500/20 bg-emerald-950/15 px-2.5 py-2 ${className}`}>
        <p className={`font-semibold text-emerald-100/95 ${compact ? "text-[10px]" : "text-xs"}`}>
          Win your first item to start shipping
        </p>
        {!compact ? <p className="mt-0.5 text-[10px] text-emerald-200/75">Bundled rates apply per seller, per show.</p> : null}
      </div>
    );
  }

  const tierLine = data.tierLabel ? ` · ${data.tierLabel}` : "";

  if (data.capReached) {
    return (
      <div className={`rounded-lg border border-amber-400/30 bg-amber-950/20 px-2.5 py-2 ${className}`}>
        <p className={`font-semibold text-amber-100 ${compact ? "text-[10px]" : "text-xs"}`}>
          Max shipping reached 🎉{tierLine}
        </p>
        <p className={`mt-0.5 text-amber-100/85 ${compact ? "text-[9px]" : "text-[10px]"}`}>Keep buying with no extra shipping</p>
      </div>
    );
  }

  const next =
    data.nextIncrementalCostCents != null && data.nextIncrementalCostCents > 0
      ? formatUsdFromCents(data.nextIncrementalCostCents)
      : null;

  return (
    <div className={`rounded-lg border border-emerald-400/25 bg-emerald-950/15 px-2.5 py-2 ${className}`}>
      <p className={`font-semibold text-emerald-100 ${compact ? "text-[10px]" : "text-xs"}`}>
        Shipping so far: {formatUsdFromCents(data.shippingCostCents)}
        {tierLine}
      </p>
      {next ? (
        <>
          <p className={`mt-0.5 text-emerald-50/95 ${compact ? "text-[9px]" : "text-[10px]"}`}>Next item adds about {next}</p>
          <p className={`mt-0.5 text-emerald-200/75 ${compact ? "text-[9px]" : "text-[10px]"}`}>Items ship together</p>
        </>
      ) : (
        <p className={`mt-0.5 text-emerald-200/75 ${compact ? "text-[9px]" : "text-[10px]"}`}>Items ship together</p>
      )}
    </div>
  );
}
