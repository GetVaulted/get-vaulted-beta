"use client";

import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useMemo, useState } from "react";
import { VaultedSecureCheckoutPanel } from "@/components/checkout/VaultedSecureCheckoutPanel";
import { PaymentDeadlineCountdown } from "@/components/orders/PaymentDeadlineCountdown";
import { estimateEscrowFeeCents, orderTotalQualifiesForEscrow } from "@/lib/escrow-config";
import { VAULTED_SECURE_CHECKOUT } from "@/lib/vaulted-secure-checkout-copy";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function OrderPaySection({
  orderId,
  paymentStatus,
  isBuyer,
  paymentDeadlineAt,
  listingBuyingFormat,
  totalUsd,
  savedCardPayEligible,
  checkoutRequiredForTax = false,
}: {
  orderId: string;
  paymentStatus: string;
  isBuyer: boolean;
  paymentDeadlineAt: string | null;
  listingBuyingFormat: string;
  totalUsd: number;
  savedCardPayEligible: boolean;
  checkoutRequiredForTax?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referralCreditUsd, setReferralCreditUsd] = useState(0);
  const [applyReferralCredit, setApplyReferralCredit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/wallet", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as { wallet?: { referralCreditUsd?: number } };
        const bal = Number(j.wallet?.referralCreditUsd ?? 0);
        if (!cancelled && Number.isFinite(bal) && bal > 0) setReferralCreditUsd(bal);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const referralDiscountUsd = useMemo(() => {
    if (!applyReferralCredit || referralCreditUsd <= 0) return 0;
    return Math.min(referralCreditUsd, Math.max(0, totalUsd - 0.5));
  }, [applyReferralCredit, referralCreditUsd, totalUsd]);
  const displayTotal = Math.max(0, totalUsd - referralDiscountUsd);

  if (!isBuyer) return null;

  if (paymentStatus === "expired") {
    return (
      <div className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-950/20 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200/90">Payment expired</p>
        <p className="mt-2 text-sm text-zinc-300">Payment window expired. This order can no longer be paid.</p>
      </div>
    );
  }

  if (paymentStatus !== "pending_payment" && paymentStatus !== "failed" && paymentStatus !== "payment_requires_action") {
    return null;
  }

  const isAuctionCheckout = listingBuyingFormat === "auction";
  const deadlineIso = paymentDeadlineAt ?? null;
  const useVaultedSecureCheckout = orderTotalQualifiesForEscrow(totalUsd);
  const secureFeeCents = estimateEscrowFeeCents(totalUsd);
  const showSavedCardCta = savedCardPayEligible && !useVaultedSecureCheckout;

  const payWithSavedCard = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/charge-saved`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applyReferralCredit: applyReferralCredit === true }),
      });
      const data = (await res.json()) as {
        error?: string;
        ok?: boolean;
        requiresAction?: boolean;
        clientSecret?: string;
        publishableKey?: string;
        processing?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "Payment failed.");
        return;
      }
      if (data.ok) {
        window.location.reload();
        return;
      }
      if (data.processing) {
        window.location.reload();
        return;
      }
      if (data.requiresAction && data.clientSecret && data.publishableKey) {
        const stripe = await loadStripe(data.publishableKey);
        if (!stripe) {
          setError("Stripe could not load.");
          return;
        }
        const conf = await stripe.confirmCardPayment(data.clientSecret);
        if (conf.error) {
          setError(conf.error.message ?? "Authentication failed.");
          return;
        }
        const syncRes = await fetch(`/api/orders/${encodeURIComponent(orderId)}/charge-saved`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sync: true }),
        });
        const syncData = (await syncRes.json()) as { error?: string; ok?: boolean; processing?: boolean };
        if (syncRes.ok && syncData.ok) {
          window.location.reload();
          return;
        }
        if (syncData.processing) {
          window.location.reload();
          return;
        }
        setError(syncData.error ?? "Check order status — payment may still be processing.");
        return;
      }
      setError("Unexpected payment response.");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const startCheckout = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "pay_order",
          orderId,
          applyReferralCredit: applyReferralCredit === true,
          successPath: `/orders/${encodeURIComponent(orderId)}`,
          cancelPath: `/orders/${encodeURIComponent(orderId)}`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not start checkout.");
        return;
      }
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setError("No checkout URL returned.");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-amber-500/25 bg-amber-950/20 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/90">
        {isAuctionCheckout ? "Auction ended — payment pending" : "Payment required"}
      </p>
      {isAuctionCheckout ? (
        <p className="mt-2 text-sm text-zinc-300">Winner has 30 minutes to pay.</p>
      ) : useVaultedSecureCheckout ? (
        <p className="mt-2 text-sm text-zinc-300">
          Complete secure checkout for this order. Status updates from the payment processor — do not rely on the
          redirect page alone.
        </p>
      ) : (
        <p className="mt-2 text-sm text-zinc-300">
          Complete Stripe checkout to confirm this order. Status updates from Stripe webhooks — do not rely on the
          redirect page alone.
        </p>
      )}
      {useVaultedSecureCheckout ? (
        <div className="mt-4">
          <VaultedSecureCheckoutPanel feeCents={secureFeeCents} />
        </div>
      ) : null}
      {checkoutRequiredForTax && isAuctionCheckout ? (
        <p className="mt-3 text-xs text-zinc-400">Secure checkout required for tax calculation.</p>
      ) : showSavedCardCta ? (
        <p className="mt-3 text-xs text-zinc-400">
          Pay with the card you saved when you placed the winning bid, or open Stripe Checkout to use a different card.
        </p>
      ) : null}
      {deadlineIso ? (
        <p className="mt-3 text-xs text-zinc-400">
          Time remaining: <PaymentDeadlineCountdown deadlineIso={deadlineIso} />
        </p>
      ) : null}
      {referralCreditUsd > 0 ? (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-gold/20 bg-gold/5 px-3 py-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-gold"
            checked={applyReferralCredit}
            onChange={(e) => setApplyReferralCredit(e.target.checked)}
          />
          <span>
            Apply referral credit ({formatMoney(referralCreditUsd)} available)
            {referralDiscountUsd > 0 ? (
              <span className="mt-0.5 block text-xs text-emerald-400/90">
                Order total becomes {formatMoney(displayTotal)}
              </span>
            ) : null}
          </span>
        </label>
      ) : null}
      {error ? <p className="mt-2 text-xs font-medium text-rose-300">{error}</p> : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {showSavedCardCta ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void payWithSavedCard()}
            className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.5)] transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Processing…" : "Pay with saved card"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void startCheckout()}
          className={
            showSavedCardCta
              ? "inline-flex h-11 items-center justify-center rounded-full border border-gold/40 px-8 text-sm font-bold text-gold-bright transition hover:bg-gold/10 disabled:opacity-60"
              : "inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-8 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.5)] transition hover:brightness-110 disabled:opacity-60"
          }
        >
          {busy && !showSavedCardCta
            ? "Redirecting…"
            : busy
              ? "Please wait…"
              : useVaultedSecureCheckout
                ? VAULTED_SECURE_CHECKOUT.cta
                : "Pay with Stripe Checkout"}
        </button>
      </div>
    </div>
  );
}
