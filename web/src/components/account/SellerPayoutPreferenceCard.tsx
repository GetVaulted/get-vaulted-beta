"use client";

import { useCallback, useEffect, useState } from "react";

type PayoutPreference = {
  paypalSellerPayoutsEnabled: boolean;
  preferredSellerPayoutProcessor: "STRIPE" | "PAYPAL";
  paypalPayoutEmail: string | null;
  paypalPayoutVerifiedAt: string | null;
  stripeOnboardingComplete: boolean;
};

/**
 * Seller HQ control: choose Stripe Connect vs PayPal payout rail.
 */
export function SellerPayoutPreferenceCard() {
  const [data, setData] = useState<PayoutPreference | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/account/seller/payout-preference", { cache: "no-store" });
    if (!res.ok) {
      setError("Could not load payout preference.");
      return;
    }
    const j = (await res.json()) as PayoutPreference;
    setData(j);
    setEmail(j.paypalPayoutEmail ?? "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account/seller/payout-preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as PayoutPreference & { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Could not save.");
        return;
      }
      setData(j);
      setEmail(j.paypalPayoutEmail ?? "");
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-black/30 p-4 text-sm text-zinc-400">
        Loading payout preference…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/30 p-4 sm:p-5">
      <h3 className="text-sm font-bold text-zinc-100">Payout method</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Choose how you receive seller earnings. Buyers still pay with card/wallet on Get Vaulted. Stripe Connect
        transfers at sale; PayPal pays out after your payout tier releases the order.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => void patch({ preferredSellerPayoutProcessor: "STRIPE" })}
          className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${
            data.preferredSellerPayoutProcessor === "STRIPE"
              ? "border-gold-bright/50 bg-gold-bright/10 text-gold-bright"
              : "border-white/10 text-zinc-300 hover:border-white/25"
          }`}
        >
          Stripe Connect
          <span className="mt-0.5 block font-normal text-zinc-500">
            {data.stripeOnboardingComplete ? "Connected" : "Complete Stripe onboarding"}
          </span>
        </button>
        <button
          type="button"
          disabled={busy || !data.paypalSellerPayoutsEnabled}
          onClick={() => void patch({ preferredSellerPayoutProcessor: "PAYPAL" })}
          className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${
            data.preferredSellerPayoutProcessor === "PAYPAL"
              ? "border-gold-bright/50 bg-gold-bright/10 text-gold-bright"
              : "border-white/10 text-zinc-300 hover:border-white/25"
          } disabled:opacity-40`}
        >
          PayPal
          <span className="mt-0.5 block font-normal text-zinc-500">
            {data.paypalSellerPayoutsEnabled
              ? data.paypalPayoutVerifiedAt
                ? "Verified email ready"
                : "Add & verify PayPal email"
              : "Not enabled yet"}
          </span>
        </button>
      </div>

      {data.paypalSellerPayoutsEnabled ? (
        <div className="mt-4 space-y-2">
          <label className="block text-xs font-semibold text-zinc-400" htmlFor="paypal-payout-email">
            PayPal payout email
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="paypal-payout-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100"
              placeholder="you@paypal.com"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch({ paypalPayoutEmail: email })}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-white/30"
            >
              Save email
            </button>
            <button
              type="button"
              disabled={busy || !email.trim()}
              onClick={() => void patch({ paypalPayoutEmail: email, verifyPayPalEmail: true })}
              className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-xs font-bold text-emerald-200"
            >
              Verify
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
      {saved ? <p className="mt-3 text-xs text-emerald-300">Saved.</p> : null}
    </div>
  );
}
