"use client";

import type { Stripe, StripeElements, StripePaymentElement } from "@stripe/stripe-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { finalizeSavedPaymentMethod, paymentMethodIdFromSetupIntent, type SavedPaymentMethodRow } from "@/lib/wallet-save-payment-method";

type Props = {
  active: boolean;
  onSaved: (paymentMethod: SavedPaymentMethodRow) => void;
  onCancel?: () => void;
  submitLabel?: string;
};

export function WalletAddPaymentMethodForm({
  active,
  onSaved,
  onCancel,
  submitLabel = "Save payment method",
}: Props) {
  const payRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentElementRef = useRef<StripePaymentElement | null>(null);
  const clientSecretRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teardown = useCallback(() => {
    try {
      paymentElementRef.current?.unmount();
    } catch {
      /* ignore */
    }
    paymentElementRef.current = null;
    elementsRef.current = null;
    stripeRef.current = null;
    clientSecretRef.current = null;
    if (payRef.current) payRef.current.innerHTML = "";
  }, []);

  useEffect(() => {
    if (!active) {
      teardown();
      setError(null);
      setBusy(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      teardown();
      try {
        const res = await fetch("/api/account/payment-methods/setup-intent", {
          method: "POST",
          credentials: "include",
        });
        const j = (await res.json().catch(() => ({}))) as {
          clientSecret?: string;
          publishableKey?: string;
          error?: string;
        };
        if (!res.ok) {
          setError(j.error ?? "Could not start card setup.");
          setBusy(false);
          return;
        }
        if (!j.clientSecret || !j.publishableKey || cancelled) {
          setError("Could not start card setup.");
          setBusy(false);
          return;
        }
        clientSecretRef.current = j.clientSecret;
        const { loadStripe } = await import("@stripe/stripe-js");
        const stripe = await loadStripe(j.publishableKey);
        if (!stripe || cancelled) {
          setError("Could not load Stripe.");
          setBusy(false);
          return;
        }
        stripeRef.current = stripe;
        const elements = stripe.elements({
          clientSecret: j.clientSecret,
          appearance: {
            theme: "night",
            variables: { colorPrimary: "#d4af37", borderRadius: "10px" },
          },
        });
        elementsRef.current = elements;
        const paymentElement = elements.create("payment");
        paymentElementRef.current = paymentElement;
        if (cancelled) return;
        if (!payRef.current) {
          setError("Could not load payment form. Try again.");
          setBusy(false);
          return;
        }
        paymentElement.mount(payRef.current);
        setBusy(false);
      } catch {
        if (!cancelled) setError("Could not start card setup.");
        setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, teardown]);

  useEffect(() => () => teardown(), [teardown]);

  const submit = async () => {
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) {
      setError("Payment form is still loading. Wait a moment and try again.");
      return;
    }
    setBusy(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Check your card details and try again.");
      setBusy(false);
      return;
    }

    const clientSecret = clientSecretRef.current;
    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: typeof window !== "undefined" ? window.location.href : undefined,
      },
      redirect: "if_required",
    });
    if (confirmError) {
      setError(confirmError.message ?? "Card could not be saved.");
      setBusy(false);
      return;
    }

    let resolvedSetupIntent = setupIntent ?? null;
    if (clientSecret) {
      const retrieved = await stripe.retrieveSetupIntent(clientSecret);
      if (retrieved.error) {
        setError(retrieved.error.message ?? "Could not verify saved card. Try again.");
        setBusy(false);
        return;
      }
      resolvedSetupIntent = retrieved.setupIntent ?? resolvedSetupIntent;
    }
    if (resolvedSetupIntent?.status && resolvedSetupIntent.status !== "succeeded") {
      setError("Card setup did not complete. Check your details and try again.");
      setBusy(false);
      return;
    }

    const finalized = await finalizeSavedPaymentMethod({
      paymentMethodId: paymentMethodIdFromSetupIntent(resolvedSetupIntent),
      setupIntentId: typeof resolvedSetupIntent?.id === "string" ? resolvedSetupIntent.id : null,
      clientSecret,
    });
    if (!finalized.ok) {
      setError(finalized.error);
      setBusy(false);
      return;
    }

    teardown();
    onSaved(finalized.paymentMethod);
    setBusy(false);
  };

  if (!active) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-zinc-500">
        Secure form powered by Stripe. Save a card or Cash App Pay to your Vault Wallet for live wins and marketplace.
      </p>
      {error ? <p className="text-xs font-medium text-rose-300">{error}</p> : null}
      <div ref={payRef} className="min-h-[200px] rounded-xl border border-white/[0.08] bg-black/40 p-3" />
      <div className="flex gap-2">
        {onCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-white/15 py-3 text-sm font-bold text-zinc-300 disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className={`${onCancel ? "flex-1" : "w-full"} rounded-xl bg-amber-400 py-3 text-sm font-black text-zinc-950 disabled:opacity-60`}
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
