"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export type LiveShippingSessionPayload = {
  shippingCostCents: number;
  pricingWeightOz: number;
  capReached: boolean;
  nextIncrementalCostCents: number | null;
  tierLabel: string | null;
  shippingCapCents: number | null;
  freeShippingEnabled: boolean;
  packageCount: number;
  previewWinDeltaCents: number | null;
  previewRequiresSeparatePackage: boolean;
};

function formatUsdFromCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function hasBundledShippingActivity(d: LiveShippingSessionPayload): boolean {
  return d.shippingCostCents > 0 || d.pricingWeightOz > 0 || d.packageCount > 0;
}

type Props = {
  liveShowId: string;
  /** Active lot — preview shipping if you win this item (helmet vs cards). */
  previewLiveRoomItemId?: string | null;
  refreshNonce?: number;
  pollMs?: number;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
};

export function LiveShippingIndicator({
  liveShowId,
  previewLiveRoomItemId = null,
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
      const sp = new URLSearchParams({ liveShowId: liveShowId.trim() });
      if (previewLiveRoomItemId?.trim()) {
        sp.set("previewItemId", previewLiveRoomItemId.trim());
      }
      const res = await fetch(`/api/live-shipping/session?${sp.toString()}`, { cache: "no-store" });
      if (res.status === 401) {
        setData(null);
        return;
      }
      if (!res.ok) {
        setData(null);
        return;
      }
      const j = (await res.json()) as LiveShippingSessionPayload;
      if (typeof j.shippingCostCents === "number" && typeof j.capReached === "boolean") {
        setData(j);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [disabled, liveShowId, previewLiveRoomItemId, status]);

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

  const capLine =
    data?.shippingCapCents != null && data.shippingCapCents > 0 && !data.freeShippingEnabled
      ? ` · cap ${formatUsdFromCents(data.shippingCapCents)}`
      : "";

  const previewDelta = data?.previewWinDeltaCents ?? data?.nextIncrementalCostCents;
  const separateHint = data?.previewRequiresSeparatePackage ? " (separate package)" : "";

  if (!data || !hasBundledShippingActivity(data)) {
    if (previewDelta != null && previewDelta > 0) {
      return (
        <div className={`rounded-lg border border-emerald-500/20 bg-emerald-950/15 px-2.5 py-2 ${className}`}>
          <p className={`font-semibold text-emerald-100/95 ${compact ? "text-[10px]" : "text-xs"}`}>
            Win this item → about {formatUsdFromCents(previewDelta)} shipping{separateHint}
          </p>
          {capLine ? (
            <p className={`mt-0.5 text-emerald-200/75 ${compact ? "text-[9px]" : "text-[10px]"}`}>
              Bundled pool{capLine}
            </p>
          ) : null}
        </div>
      );
    }
    return (
      <div className={`rounded-lg border border-emerald-500/20 bg-emerald-950/15 px-2.5 py-2 ${className}`}>
        <p className={`font-semibold text-emerald-100/95 ${compact ? "text-[10px]" : "text-xs"}`}>
          Win your first item to start shipping
        </p>
        {!compact ? (
          <p className="mt-0.5 text-[10px] text-emerald-200/75">
            One pool per seller per show{capLine || " — cards bundle; big items may ship separately"}.
          </p>
        ) : null}
      </div>
    );
  }

  const tierLine = data.tierLabel ? ` · ${data.tierLabel}` : "";

  if (data.freeShippingEnabled) {
    return (
      <div className={`rounded-lg border border-emerald-400/25 bg-emerald-950/15 px-2.5 py-2 ${className}`}>
        <p className={`font-semibold text-emerald-100 ${compact ? "text-[10px]" : "text-xs"}`}>
          Free shipping on this show{tierLine}
        </p>
      </div>
    );
  }

  if (data.capReached) {
    return (
      <div className={`rounded-lg border border-amber-400/30 bg-amber-950/20 px-2.5 py-2 ${className}`}>
        <p className={`font-semibold text-amber-100 ${compact ? "text-[10px]" : "text-xs"}`}>
          Shipping pool max reached 🎉{tierLine}
          {capLine}
        </p>
        <p className={`mt-0.5 text-amber-100/85 ${compact ? "text-[9px]" : "text-[10px]"}`}>
          Keep buying — no extra shipping until cap changes
        </p>
      </div>
    );
  }

  const next =
    previewDelta != null && previewDelta > 0 ? formatUsdFromCents(previewDelta) : null;

  return (
    <div className={`rounded-lg border border-emerald-400/25 bg-emerald-950/15 px-2.5 py-2 ${className}`}>
      <p className={`font-semibold text-emerald-100 ${compact ? "text-[10px]" : "text-xs"}`}>
        Shipping pool: {formatUsdFromCents(data.shippingCostCents)}
        {tierLine}
        {capLine}
      </p>
      {next ? (
        <>
          <p className={`mt-0.5 text-emerald-50/95 ${compact ? "text-[9px]" : "text-[10px]"}`}>
            Win this item → adds about {next}
            {separateHint}
          </p>
          <p className={`mt-0.5 text-emerald-200/75 ${compact ? "text-[9px]" : "text-[10px]"}`}>
            All wins in this show share one capped pool
          </p>
        </>
      ) : (
        <p className={`mt-0.5 text-emerald-200/75 ${compact ? "text-[9px]" : "text-[10px]"}`}>
          Items ship together in your pool
        </p>
      )}
    </div>
  );
}
