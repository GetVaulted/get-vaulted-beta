"use client";

import { useState } from "react";
import { GET_VAULTED_TRADE_PLATFORM_FEE_USD } from "@/lib/trade-platform-fee";

export function TradePlatformFeePayButton({
  offerId,
  alreadyPaid,
}: {
  offerId: string;
  alreadyPaid: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyPaid) {
    return (
      <p className="text-sm font-semibold text-emerald-200">
        Your ${GET_VAULTED_TRADE_PLATFORM_FEE_USD.toFixed(2)} platform fee is paid.
      </p>
    );
  }

  const onPay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trade/offers/${encodeURIComponent(offerId)}/platform-fee-checkout`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string | null;
        alreadyPaid?: boolean;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not start checkout.");
        return;
      }
      if (body.alreadyPaid) {
        window.location.reload();
        return;
      }
      if (!body.url) {
        setError("Checkout URL missing.");
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("Could not start checkout.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onPay()}
        className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-5 text-sm font-bold text-zinc-950 shadow-[0_12px_34px_-14px_rgba(201,162,39,0.55)] transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "Opening checkout…" : `Pay $${GET_VAULTED_TRADE_PLATFORM_FEE_USD.toFixed(2)} platform fee`}
      </button>
      {error ? <p className="text-xs font-medium text-red-300">{error}</p> : null}
    </div>
  );
}
