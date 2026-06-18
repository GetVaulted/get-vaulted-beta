"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { Stripe, StripeElements, StripePaymentElement } from "@stripe/stripe-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccountOrdersNav } from "@/components/account/AccountOrdersNav";
import { AccountWalletShippingSection } from "@/components/account/AccountWalletShippingSection";
import { BuyerWalletReadinessBanner } from "@/components/account/BuyerWalletReadinessBanner";
import { WALLET_METHOD_CATALOG, walletMethodEligibilityLabel } from "@/lib/stripe-payment-method-config";

type PmRow = { id: string; brand: string; last4: string; expMonth: number; expYear: number };

function paymentMethodIdFromSetupIntent(
  setupIntent: { payment_method?: string | { id?: string } | null } | null | undefined,
): string | null {
  if (!setupIntent) return null;
  const pm = setupIntent.payment_method;
  if (typeof pm === "string" && pm.startsWith("pm_")) return pm;
  if (pm && typeof pm === "object" && typeof pm.id === "string" && pm.id.startsWith("pm_")) return pm.id;
  return null;
}

async function finalizeSavedPaymentMethod(args: {
  paymentMethodId?: string | null;
  setupIntentId?: string | null;
  clientSecret?: string | null;
}): Promise<
  | { ok: true; paymentMethodId: string; expMonth: number; expYear: number; brand: string; last4: string }
  | { ok: false; error: string }
> {
  const body: Record<string, string> = {};
  if (args.paymentMethodId?.startsWith("pm_")) body.paymentMethodId = args.paymentMethodId;
  if (args.setupIntentId?.startsWith("seti_")) body.setupIntentId = args.setupIntentId;
  if (args.clientSecret?.includes("_secret_")) body.clientSecret = args.clientSecret;
  if (!body.paymentMethodId && !body.setupIntentId && !body.clientSecret) {
    return { ok: false, error: "Card save did not return a payment method. Try again." };
  }
  const res = await fetch("/api/account/payment-methods/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as {
    error?: string;
    paymentMethodId?: string;
    expMonth?: number;
    expYear?: number;
    brand?: string;
    last4?: string;
  };
  if (!res.ok) {
    return { ok: false, error: typeof j.error === "string" ? j.error : "Could not save payment method." };
  }
  if (!j.paymentMethodId?.startsWith("pm_")) {
    return { ok: false, error: "Card save did not return a payment method. Try again." };
  }
  return {
    ok: true,
    paymentMethodId: j.paymentMethodId,
    expMonth: typeof j.expMonth === "number" ? j.expMonth : 0,
    expYear: typeof j.expYear === "number" ? j.expYear : 0,
    brand: typeof j.brand === "string" && j.brand.trim() ? j.brand : "Card",
    last4: typeof j.last4 === "string" && j.last4.trim() ? j.last4 : "0000",
  };
}

function formatExp(m: number, y: number) {
  if (!m || !y) return "—";
  return `${String(m).padStart(2, "0")}/${String(y).slice(-2)}`;
}

export function AccountPaymentMethodsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [rows, setRows] = useState<PmRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stripeConfigured, setStripeConfigured] = useState(true);
  const [banner, setBanner] = useState<{ text: string; tone: "success" | "error" | "warning" } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [walletRefreshKey, setWalletRefreshKey] = useState(0);
  const payRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentElementRef = useRef<StripePaymentElement | null>(null);
  const clientSecretRef = useRef<string | null>(null);

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

  const loadList = useCallback(async () => {
    setLoading(true);
    setBanner(null);
    try {
      const res = await fetch("/api/account/payment-methods", { cache: "no-store", credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as {
        paymentMethods?: PmRow[];
        stripeConfigured?: boolean;
        message?: string;
      };
      setStripeConfigured(j.stripeConfigured !== false);
      if (!res.ok && typeof j.message !== "string") {
        setBanner({ text: "Could not load saved cards. Try again.", tone: "error" });
      } else if (typeof j.message === "string") {
        setBanner({ text: j.message, tone: "warning" });
      }
      setRows(Array.isArray(j.paymentMethods) ? j.paymentMethods : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/signin?returnTo=/account/payment-methods");
    }
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void loadList();
  }, [loadList, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const setupIntentId = searchParams?.get("setup_intent")?.trim();
    if (!setupIntentId) return;

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setBanner(null);
      try {
        if (searchParams?.get("redirect_status") === "succeeded") {
          const finalized = await finalizeSavedPaymentMethod({ setupIntentId });
          router.replace("/account/payment-methods");
          await loadList();
          if (!cancelled) {
            if (finalized.ok) {
              setWalletRefreshKey((k) => k + 1);
            }
            setBanner(
              finalized.ok
                ? { text: "Payment method saved.", tone: "success" }
                : { text: finalized.error, tone: "error" },
            );
          }
        } else {
          router.replace("/account/payment-methods");
          await loadList();
          if (!cancelled) {
            setBanner({ text: "Card setup did not complete. Try again.", tone: "error" });
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadList, router, searchParams, status]);

  useEffect(() => {
    return () => teardown();
  }, [teardown]);

  useEffect(() => {
    if (!formOpen) {
      teardown();
      return;
    }
    let cancelled = false;
    void (async () => {
      setFormBusy(true);
      setFormError(null);
      teardown();
      try {
        const res = await fetch("/api/account/payment-methods/setup-intent", {
          method: "POST",
          credentials: "same-origin",
        });
        const j = (await res.json().catch(() => ({}))) as {
          clientSecret?: string;
          publishableKey?: string;
          error?: string;
        };
        if (!res.ok) {
          setFormError(j.error ?? "Could not start card setup.");
          setFormBusy(false);
          return;
        }
        if (!j.clientSecret || !j.publishableKey || cancelled) {
          setFormError("Could not start card setup.");
          setFormBusy(false);
          return;
        }
        clientSecretRef.current = j.clientSecret;
        const { loadStripe } = await import("@stripe/stripe-js");
        const stripe = await loadStripe(j.publishableKey);
        if (!stripe || cancelled) {
          setFormError("Could not load Stripe.");
          setFormBusy(false);
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
          setFormError("Could not load payment form. Close and try again.");
          setFormBusy(false);
          return;
        }
        paymentElement.mount(payRef.current);
        setFormBusy(false);
      } catch {
        if (!cancelled) setFormError("Could not start card setup.");
        setFormBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formOpen, teardown]);

  const submitCard = async () => {
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) {
      setFormError("Payment form is still loading. Wait a moment and try again.");
      return;
    }
    setFormBusy(true);
    setFormError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setFormError(submitError.message ?? "Check your card details and try again.");
      setFormBusy(false);
      return;
    }

    const base = typeof window !== "undefined" ? window.location.origin : "";
    const clientSecret = clientSecretRef.current;
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${base}/account/payment-methods`,
      },
      redirect: "if_required",
    });
    if (error) {
      setFormError(error.message ?? "Card could not be saved.");
      setFormBusy(false);
      return;
    }

    let resolvedSetupIntent = setupIntent ?? null;
    if (clientSecret) {
      const retrieved = await stripe.retrieveSetupIntent(clientSecret);
      if (retrieved.error) {
        setFormError(retrieved.error.message ?? "Could not verify saved card. Try again.");
        setFormBusy(false);
        return;
      }
      resolvedSetupIntent = retrieved.setupIntent ?? resolvedSetupIntent;
    }
    if (resolvedSetupIntent?.status && resolvedSetupIntent.status !== "succeeded") {
      setFormError("Card setup did not complete. Check your details and try again.");
      setFormBusy(false);
      return;
    }

    const finalized = await finalizeSavedPaymentMethod({
      paymentMethodId: paymentMethodIdFromSetupIntent(resolvedSetupIntent),
      setupIntentId: typeof resolvedSetupIntent?.id === "string" ? resolvedSetupIntent.id : null,
      clientSecret,
    });
    if (!finalized.ok) {
      setFormError(finalized.error);
      setFormBusy(false);
      return;
    }

    setFormOpen(false);
    teardown();
    await loadList();
    setRows((prev) => {
      if (prev.some((row) => row.id === finalized.paymentMethodId)) return prev;
      return [
        ...prev,
        {
          id: finalized.paymentMethodId,
          brand: finalized.brand,
          last4: finalized.last4,
          expMonth: finalized.expMonth,
          expYear: finalized.expYear,
        },
      ];
    });
    setBanner({ text: "Payment method saved.", tone: "success" });
    setWalletRefreshKey((k) => k + 1);
    router.refresh();
    setFormBusy(false);
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
        <div className="mx-auto w-full max-w-[1920px] px-4 py-24 text-center text-sm text-zinc-500">Loading…</div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(14,14,18,0.55)_0%,#030303_38%,#030303_100%)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(360px,50vh)] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.06),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[1920px] px-3 pb-16 pt-5 sm:px-4 lg:px-10">
        <Link
          href="/marketplace"
          className="text-xs font-semibold uppercase tracking-wide text-gold-bright/90 hover:text-gold-bright"
        >
          ← Marketplace
        </Link>
        <header className="mt-5 border-b border-white/[0.07] pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Account</p>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-foreground">Wallet</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Saved payment methods and shipping addresses for live shows, auction wins, and checkout. Cards are stored
            with Stripe; addresses stay on your Vaulted profile.
          </p>
          <div className="mt-4">
            <AccountOrdersNav active="payments" />
          </div>
        </header>

        <div className="mt-6">
          <BuyerWalletReadinessBanner refreshKey={walletRefreshKey} />
        </div>

        {banner ? (
          <p
            className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
              banner.tone === "warning"
                ? "border-amber-500/25 bg-amber-500/10 text-amber-100/95"
                : banner.tone === "error"
                  ? "border-rose-500/25 bg-rose-500/10 text-rose-100/95"
                  : "border-emerald-500/25 bg-emerald-500/10 text-emerald-100/95"
            }`}
          >
            {banner.text}
          </p>
        ) : null}

        <section className="mt-8 space-y-4" aria-label="Saved payment methods">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading payment methods…</p>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0d]/80 px-6 py-12 text-center">
              <p className="text-sm font-medium text-zinc-200">No payment method added yet</p>
              <p className="mt-2 text-xs text-zinc-500">
                Add a debit or credit card to use when you win auctions or complete purchases.
              </p>
              {stripeConfigured ? (
                <button
                  type="button"
                  disabled={formOpen}
                  onClick={() => setFormOpen(true)}
                  className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_0_24px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110 disabled:opacity-50"
                >
                  Add payment method
                </button>
              ) : (
                <p className="mt-6 text-xs text-zinc-600">Wallet is unavailable until Stripe is configured on this server.</p>
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-white/[0.08] bg-[#08080a]/90 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-zinc-100">
                    {r.brand} ···· {r.last4}
                  </p>
                  <p className="text-[11px] text-zinc-500">Expires {formatExp(r.expMonth, r.expYear)}</p>
                </li>
              ))}
            </ul>
          )}

          {!loading && rows.length > 0 && stripeConfigured ? (
            <button
              type="button"
              disabled={formOpen}
              onClick={() => setFormOpen(true)}
              className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 px-5 text-xs font-bold uppercase tracking-wide text-gold-bright transition hover:border-gold/40 hover:bg-gold/10 disabled:opacity-50"
            >
              Add another card
            </button>
          ) : null}
        </section>

        <section className="mt-10 space-y-3" aria-label="Accepted payment methods">
          <h2 className="font-display text-lg font-bold text-foreground">Payment methods</h2>
          <p className="text-xs text-zinc-500">
            Saved methods charge instantly for live wins. Marketplace checkout may also offer payment plans when
            Stripe says you are eligible.
          </p>
          <ul className="space-y-2">
            {WALLET_METHOD_CATALOG.filter((e) => e.savableInWallet).map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-white/[0.08] bg-[#08080a]/90 px-4 py-3"
              >
                <p className="text-sm font-semibold text-zinc-100">{entry.label}</p>
                <p className="text-[11px] text-zinc-500">{walletMethodEligibilityLabel(entry)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 space-y-3" aria-label="Marketplace payment plans">
          <h2 className="font-display text-lg font-bold text-foreground">Marketplace payment plans</h2>
          <p className="text-xs text-zinc-500">Available for Marketplace checkout only — not live auctions or trades.</p>
          <ul className="space-y-2">
            {WALLET_METHOD_CATALOG.filter((e) => !e.savableInWallet).map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-white/[0.08] bg-[#08080a]/90 px-4 py-3"
              >
                <p className="text-sm font-semibold text-zinc-100">{entry.label}</p>
                <p className="text-[11px] text-zinc-500">{walletMethodEligibilityLabel(entry)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 rounded-xl border border-white/[0.08] bg-[#08080a]/90 px-4 py-3" aria-label="Payout method">
          <p className="text-sm font-semibold text-zinc-100">Payout method</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Seller payouts use Stripe Connect bank accounts — separate from buyer payment methods. Manage payouts in
            Seller Hub.
          </p>
        </section>

        {formOpen && stripeConfigured ? (
          <section className="mt-10 rounded-2xl border border-white/[0.1] bg-[#0c0c10] p-5 sm:p-6" aria-label="Add card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-foreground">Add payment method</h2>
              <button
                type="button"
                disabled={formBusy}
                onClick={() => {
                  setFormOpen(false);
                  setFormError(null);
                }}
                className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Secure form powered by Stripe. Your full card number never touches our servers.</p>
            {formError ? <p className="mt-3 text-xs font-medium text-rose-300">{formError}</p> : null}
            <div ref={payRef} className="mt-4 min-h-[200px] rounded-xl border border-white/[0.08] bg-black/40 p-3" />
            <button
              type="button"
              disabled={formBusy}
              onClick={() => void submitCard()}
              className="mt-4 flex h-11 w-full max-w-sm items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 disabled:opacity-60"
            >
              {formBusy ? "Saving…" : "Save card"}
            </button>
          </section>
        ) : null}

        {status === "authenticated" ? <AccountWalletShippingSection /> : null}

        <p className="mt-10 text-center text-xs text-zinc-600">
          Signed in as <span className="text-zinc-400">{session?.user?.email}</span>
        </p>
      </div>
    </main>
  );
}
