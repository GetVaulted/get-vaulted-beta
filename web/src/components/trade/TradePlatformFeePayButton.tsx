"use client";

import { useEffect, useState } from "react";
import { GET_VAULTED_TRADE_PLATFORM_FEE_USD } from "@/lib/trade-platform-fee";

type QuoteState =
  | { status: "loading" }
  | { status: "ready"; shippingUsd: number; carrier: string; serviceLevel: string; totalUsd: number }
  | { status: "error"; message: string };

export function TradePlatformFeePayButton({
  offerId,
  alreadyPaid,
}: {
  offerId: string;
  alreadyPaid: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteState>({ status: "loading" });

  useEffect(() => {
    if (alreadyPaid) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/trade/offers/${encodeURIComponent(offerId)}/shipping-quote`, {
          method: "POST",
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          shippingUsd?: number;
          carrier?: string;
          serviceLevel?: string;
          totalUsd?: number;
        };
        if (cancelled) return;
        if (!res.ok) {
          setQuote({ status: "error", message: body.error ?? "Could not quote shipping." });
          return;
        }
        setQuote({
          status: "ready",
          shippingUsd: Number(body.shippingUsd) || 0,
          carrier: body.carrier ?? "Carrier",
          serviceLevel: body.serviceLevel ?? "Shipping",
          totalUsd:
            typeof body.totalUsd === "number"
              ? body.totalUsd
              : GET_VAULTED_TRADE_PLATFORM_FEE_USD + (Number(body.shippingUsd) || 0),
        });
      } catch {
        if (!cancelled) setQuote({ status: "error", message: "Could not quote shipping." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [alreadyPaid, offerId]);

  if (alreadyPaid) {
    return (
      <p className="text-sm font-semibold text-emerald-200">
        Your platform fee and outbound label are paid.
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
    <div className="space-y-3">
      {quote.status === "loading" ? (
        <p className="text-xs text-zinc-500">Getting your outbound shipping rate…</p>
      ) : null}
      {quote.status === "error" ? (
        <p className="text-xs font-medium text-amber-200">{quote.message}</p>
      ) : null}
      {quote.status === "ready" ? (
        <div className="space-y-1 text-xs text-zinc-400">
          <p>
            Platform fee: ${GET_VAULTED_TRADE_PLATFORM_FEE_USD.toFixed(2)} · Shipping ({quote.carrier}{" "}
            {quote.serviceLevel}): ${quote.shippingUsd.toFixed(2)}
          </p>
          <p className="text-sm font-semibold text-zinc-100">One charge: ${quote.totalUsd.toFixed(2)}</p>
        </div>
      ) : null}
      <button
        type="button"
        disabled={busy || quote.status !== "ready"}
        onClick={() => void onPay()}
        className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-5 text-sm font-bold text-zinc-950 shadow-[0_12px_34px_-14px_rgba(201,162,39,0.55)] transition hover:brightness-110 disabled:opacity-60"
      >
        {busy
          ? "Opening checkout…"
          : quote.status === "ready"
            ? `Pay $${quote.totalUsd.toFixed(2)} (fee + label)`
            : "Pay fee + shipping"}
      </button>
      {error ? <p className="text-xs font-medium text-red-300">{error}</p> : null}
    </div>
  );
}
