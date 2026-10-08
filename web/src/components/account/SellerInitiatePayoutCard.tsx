"use client";

import { useCallback, useEffect, useState } from "react";
import type { SellerSelfPayoutSummary } from "@/lib/seller-self-payout";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

/** "Initiate Payout": the seller sends their own shipped, ready earnings to their bank. */
export function SellerInitiatePayoutCard({ onPaidOut }: { onPaidOut?: () => void }) {
  const [summary, setSummary] = useState<SellerSelfPayoutSummary | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/seller/payout", { cache: "no-store" });
      if (!res.ok) return;
      setSummary((await res.json()) as SellerSelfPayoutSummary);
    } catch {
      // Leave the card hidden/stale; the rest of the page still works.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/seller/payout", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<SellerSelfPayoutSummary>) : null))
      .then((j) => {
        if (!cancelled && j) setSummary(j);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/account/seller/payout", { method: "POST" });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      setNotice({
        tone: j?.ok ? "ok" : "error",
        text: j?.message ?? (res.ok ? "Payout started." : "We couldn't start your payout. Please try again."),
      });
      if (j?.ok) onPaidOut?.();
    } catch {
      setNotice({ tone: "error", text: "We couldn't reach the server. Check your connection and try again." });
    } finally {
      setConfirming(false);
      setBusy(false);
      void load();
    }
  }, [busy, load, onPaidOut]);

  // Sellers without a Stripe account (e.g. PayPal sellers) keep their current flow.
  if (!summary || summary.blockedReason === "no_stripe_account") return null;

  return (
    <section className="mt-4 rounded-2xl border border-gold/25 bg-gold/[0.06] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-bright/80">
            Available in your Stripe balance
          </p>
          <p className="mt-1 font-display text-3xl font-black tabular-nums text-gold-bright">
            {formatMoney(summary.availableUsd ?? summary.payableUsd)}
          </p>
          <dl className="mt-2 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 text-xs tabular-nums">
            <dt className="text-zinc-300">Ready to send to your bank</dt>
            <dd className="text-right font-bold text-zinc-100">{formatMoney(summary.payableUsd)}</dd>
            {(summary.waitingUsd ?? 0) >= 0.01 ? (
              <>
                <dt className="text-zinc-500">Unlocks when orders ship</dt>
                <dd className="text-right text-zinc-400">{formatMoney(summary.waitingUsd ?? 0)}</dd>
              </>
            ) : null}
          </dl>
          <p className="mt-2 max-w-md text-xs text-zinc-400">{notice ? notice.text : summary.message}</p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
                className="inline-flex h-10 items-center justify-center rounded-full bg-gold px-5 text-xs font-extrabold uppercase tracking-wide text-black transition hover:bg-gold-bright disabled:opacity-60"
              >
                {busy ? "Sending…" : `Send ${formatMoney(summary.payableUsd)}`}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 px-4 text-xs font-bold uppercase tracking-wide text-zinc-300 transition hover:bg-white/5 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!summary.canInitiate || busy}
              onClick={() => {
                setNotice(null);
                setConfirming(true);
              }}
              className="inline-flex h-11 items-center justify-center rounded-full bg-gold px-6 text-xs font-extrabold uppercase tracking-wide text-black transition hover:bg-gold-bright disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
            >
              Initiate payout
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
