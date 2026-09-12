"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  buyerLiveShippingPaidCopy,
  buyerLiveShippingPreviewCopy,
  buyerLiveShowShippingHudCopy,
} from "@/lib/live-show-shipping-terms";
import type { LiveShowShippingMode } from "@/lib/live-show-shipping-terms";

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
  shippingMode?: LiveShowShippingMode;
  showShippingHudCopy?: string | null;
};


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

  const previewDelta = data?.previewWinDeltaCents ?? data?.nextIncrementalCostCents;
  const separateHint = data?.previewRequiresSeparatePackage ? " (separate package)" : "";

  const shippingMode: LiveShowShippingMode =
    data?.shippingMode ??
    (data?.freeShippingEnabled ? "free" : data?.shippingCapCents != null ? "capped" : "calculated");

  const hudCopy =
    data?.showShippingHudCopy ??
    buyerLiveShowShippingHudCopy({ mode: shippingMode, capCents: data?.shippingCapCents });

  if (!data || !hasBundledShippingActivity(data)) {
    const previewFrom = previewDelta != null && previewDelta > 0 ? previewDelta : null;
    const previewCopy = buyerLiveShippingPreviewCopy({
      mode: shippingMode,
      previewFromCents: previewFrom,
      capCents: data?.shippingCapCents ?? null,
    });
    if (previewFrom != null) {
      return (
        <div className={`rounded-lg border border-emerald-500/20 bg-emerald-950/15 px-2.5 py-2 ${className}`}>
          <p className={`font-semibold text-emerald-100/95 ${compact ? "text-[10px]" : "text-xs"}`}>
            {previewCopy}
            {separateHint}
          </p>
          <p className={`mt-0.5 text-emerald-200/75 ${compact ? "text-[9px]" : "text-[10px]"}`}>{hudCopy}</p>
        </div>
      );
    }
    return (
      <div className={`rounded-lg border border-emerald-500/20 bg-emerald-950/15 px-2.5 py-2 ${className}`}>
        <p className={`font-semibold text-emerald-100/95 ${compact ? "text-[10px]" : "text-xs"}`}>{hudCopy}</p>
      </div>
    );
  }

  if (data.freeShippingEnabled || shippingMode === "free") {
    return (
      <div className={`rounded-lg border border-emerald-400/25 bg-emerald-950/15 px-2.5 py-2 ${className}`}>
        <p className={`font-semibold text-emerald-100 ${compact ? "text-[10px]" : "text-xs"}`}>
          {buyerLiveShippingPaidCopy({
            mode: "free",
            paidCents: data.shippingCostCents,
            capCents: data.shippingCapCents,
            capReached: false,
          })}
        </p>
      </div>
    );
  }

  const atCap =
    data.capReached ||
    (data.shippingCapCents != null && data.shippingCapCents > 0 && data.shippingCostCents >= data.shippingCapCents);

  if (atCap) {
    return (
      <div className={`rounded-lg border border-emerald-400/25 bg-emerald-950/15 px-2.5 py-2 ${className}`}>
        <p className={`font-semibold text-emerald-100 ${compact ? "text-[10px]" : "text-xs"}`}>
          {buyerLiveShippingPaidCopy({
            mode: shippingMode,
            paidCents: data.shippingCostCents,
            capCents: data.shippingCapCents,
            capReached: true,
          })}
        </p>
      </div>
    );
  }

  const paidCopy = buyerLiveShippingPaidCopy({
    mode: shippingMode,
    paidCents: data.shippingCostCents,
    capCents: data.shippingCapCents,
    capReached: false,
  });

  const previewFrom = previewDelta != null && previewDelta > 0 ? previewDelta : null;
  const previewCopy =
    previewFrom != null
      ? `Next win adds $${(previewFrom / 100).toFixed(2)} shipping`
      : null;

  return (
    <div className={`rounded-lg border border-emerald-400/25 bg-emerald-950/15 px-2.5 py-2 ${className}`}>
      <p className={`font-semibold text-emerald-100 ${compact ? "text-[10px]" : "text-xs"}`}>{paidCopy}</p>
      {previewCopy ? (
        <p className={`mt-0.5 text-emerald-50/95 ${compact ? "text-[9px]" : "text-[10px]"}`}>
          {previewCopy}
          {separateHint}
        </p>
      ) : null}
    </div>
  );
}
