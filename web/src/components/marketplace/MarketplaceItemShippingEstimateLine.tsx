"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { formatMarketplaceUsd } from "@/lib/format-marketplace-usd";
import {
  normalizeHandlingEstimate,
  usesCarrierCalculatedShipping,
} from "@/lib/marketplace-shipping-display";

type MarketplaceItemShippingEstimateLineProps = {
  listingId: string;
  flatShippingUsd?: number | null;
  handlingEstimate: string;
};

export function MarketplaceItemShippingEstimateLine({
  listingId,
  flatShippingUsd,
  handlingEstimate,
}: MarketplaceItemShippingEstimateLineProps) {
  const { data: session, status } = useSession();
  const handling = normalizeHandlingEstimate(handlingEstimate);
  const [shippingLabel, setShippingLabel] = useState<string | null>(() =>
    !usesCarrierCalculatedShipping(flatShippingUsd)
      ? `${formatMarketplaceUsd(flatShippingUsd ?? 0)} shipping`
      : null,
  );
  const [loading, setLoading] = useState(
    usesCarrierCalculatedShipping(flatShippingUsd) && status === "authenticated",
  );

  useEffect(() => {
    if (!usesCarrierCalculatedShipping(flatShippingUsd)) {
      setShippingLabel(`${formatMarketplaceUsd(flatShippingUsd ?? 0)} shipping`);
      setLoading(false);
      return;
    }

    if (status === "loading") return;

    if (!session?.user?.id) {
      setShippingLabel("Shipping estimated at checkout");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const res = await fetch(`/api/listings/${encodeURIComponent(listingId)}/shipping-estimate`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          display?: string | null;
          needsAddress?: boolean;
          needsSignIn?: boolean;
        };

        if (cancelled) return;

        if (data.display) {
          setShippingLabel(`${data.display} shipping`);
        } else if (data.needsAddress) {
          setShippingLabel("Add a shipping address to preview rates");
        } else {
          setShippingLabel("Shipping estimated at checkout");
        }
      } catch {
        if (!cancelled) setShippingLabel("Shipping estimated at checkout");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [flatShippingUsd, listingId, session?.user?.id, status]);

  return (
    <p className="text-sm text-zinc-400">
      {loading ? "Estimating shipping…" : shippingLabel ?? "Shipping estimated at checkout"} · {handling}
    </p>
  );
}
