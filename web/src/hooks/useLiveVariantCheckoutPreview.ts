"use client";

import { useEffect, useState } from "react";
import {
  fetchLiveVariantCheckoutPreview,
  type LiveVariantCheckoutPreview,
} from "@/lib/live-variant-checkout-preview-client";

export function useLiveVariantCheckoutPreview(args: {
  enabled: boolean;
  liveRoomId: string;
  itemId: string | null | undefined;
  itemPriceUsd: number;
}): { preview: LiveVariantCheckoutPreview | null; loading: boolean } {
  const [preview, setPreview] = useState<LiveVariantCheckoutPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!args.enabled || !args.itemId || args.itemPriceUsd <= 0) {
      setPreview(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    void fetchLiveVariantCheckoutPreview({
      liveRoomId: args.liveRoomId,
      itemId: args.itemId,
      itemPriceUsd: args.itemPriceUsd,
    }).then((next) => {
      if (cancelled) return;
      setPreview(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [args.enabled, args.itemId, args.itemPriceUsd, args.liveRoomId]);

  return { preview, loading };
}

export function formatLiveVariantCheckoutHudMeta(preview: LiveVariantCheckoutPreview): string {
  const spot = preview.itemPriceUsd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
  return `Spot ${spot} · Ship ${preview.shippingDisplay} · Tax ${preview.taxDisplay}`;
}
