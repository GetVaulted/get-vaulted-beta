"use client";

import { useEffect, useState } from "react";
import {
  buyerWalletReady,
  buyerWalletStatusDetail,
  buyerWalletStatusLabel,
  type BuyerWalletReadinessSnapshot,
} from "@/lib/buyer-wallet-readiness-display";

export function BuyerWalletReadinessBanner() {
  const [snapshot, setSnapshot] = useState<BuyerWalletReadinessSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/account/wallet-readiness", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as BuyerWalletReadinessSnapshot;
      if (!cancelled) {
        setSnapshot({
          paymentReady: j.paymentReady === true,
          shippingReady: j.shippingReady === true,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!snapshot) return null;

  const ready = buyerWalletReady(snapshot);

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 ${
        ready
          ? "border-emerald-500/30 bg-emerald-950/15"
          : "border-amber-500/30 bg-amber-950/10"
      }`}
    >
      <p className={`text-sm font-semibold ${ready ? "text-emerald-200" : "text-amber-100"}`}>
        {buyerWalletStatusLabel(snapshot)}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{buyerWalletStatusDetail(snapshot)}</p>
    </div>
  );
}
