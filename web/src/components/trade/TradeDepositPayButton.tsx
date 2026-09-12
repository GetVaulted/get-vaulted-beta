"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/trade-offers";

/** Pay refundable security deposit (straight / $0-cash trades). */
export function TradeDepositPayButton({
  offerId,
  amountUsd,
  alreadyPaid,
}: {
  offerId: string;
  amountUsd: number;
  alreadyPaid: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(alreadyPaid);

  useEffect(() => {
    setPaid(alreadyPaid);
  }, [alreadyPaid]);

  if (paid || amountUsd <= 0) {
    return (
      <p className="text-sm font-semibold text-emerald-200">
        Security deposit ({formatMoney(amountUsd)}) paid — refunded when both confirm receipt.
      </p>
    );
  }

  const onPay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trade/offers/${encodeURIComponent(offerId)}/deposit-checkout`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string | null;
        alreadyPaid?: boolean;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not start deposit checkout.");
        return;
      }
      if (body.alreadyPaid) {
        setPaid(true);
        return;
      }
      if (!body.url) {
        setError("Checkout URL missing.");
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError("Could not start deposit checkout.");
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
        className="inline-flex h-11 w-full items-center justify-center rounded-full border border-sky-300/30 bg-sky-950/30 px-5 text-sm font-semibold text-sky-100 transition hover:bg-sky-950/45 disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Starting…" : `Pay ${formatMoney(amountUsd)} refundable deposit`}
      </button>
      <p className="text-[11px] text-zinc-500">
        Required on straight trades (no cash). Get Vaulted holds it until both confirm receipt, then refunds it.
        Required before you can mark shipped. Stripe card fees apply.
      </p>
      {error ? <p className="text-xs font-medium text-rose-300">{error}</p> : null}
    </div>
  );
}
