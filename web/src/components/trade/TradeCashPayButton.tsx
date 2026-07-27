"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/trade-offers";

/** Pay optional trade cash via Stripe (separate from fee + label). */
export function TradeCashPayButton({
  offerId,
  amountUsd,
  payeeUsername,
  alreadyPaid,
}: {
  offerId: string;
  amountUsd: number;
  payeeUsername: string | null;
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
        Trade cash ({formatMoney(amountUsd)}) is paid
        {payeeUsername ? ` to @${payeeUsername}` : ""}.
      </p>
    );
  }

  const onPay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trade/offers/${encodeURIComponent(offerId)}/cash-checkout`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string | null;
        alreadyPaid?: boolean;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not start cash checkout.");
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
      setError("Could not start cash checkout.");
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
        className="inline-flex h-11 w-full items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-950/30 px-5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-950/45 disabled:opacity-60 sm:w-auto"
      >
        {busy
          ? "Starting…"
          : `Pay ${formatMoney(amountUsd)} cash${payeeUsername ? ` to @${payeeUsername}` : ""}`}
      </button>
      <p className="text-[11px] text-zinc-500">
        Separate from the platform fee + shipping label. Stripe card processing fees apply. Get Vaulted{" "}
        <span className="text-zinc-400">holds this cash until both of you confirm receipt</span> (or an admin
        resolves a dispute) — then it goes to your partner&apos;s payout account.
      </p>
      {error ? <p className="text-xs font-medium text-rose-300">{error}</p> : null}
    </div>
  );
}
