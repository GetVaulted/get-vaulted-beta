"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BuyerWalletSummaryDTO } from "@/lib/buyer-wallet";
import {
  LIVE_PREMIUM_WALLET_TITLE,
  formatPaymentSummary,
  formatShipToLine,
  liveAcceptedMethodsLabel,
  liveAcceptedWalletMethods,
} from "@/lib/live-premium-wallet";
import { WalletAddPaymentMethodForm } from "@/components/wallet/WalletAddPaymentMethodForm";
import { WalletInlineShippingForm, type WalletShippingAddressRow } from "@/components/wallet/WalletInlineShippingForm";

type Step = "main" | "shipping" | "payment" | "add_card" | "add_shipping" | "premium";

type AddrRow = WalletShippingAddressRow & { name?: string };

type PmRow = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  liveRoomId: string;
  onReadinessChange?: (ready: boolean) => void;
};

function SheetHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="relative mb-3 flex min-h-9 shrink-0 items-center">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-0 z-10 rounded-lg px-2 py-1 text-sm font-bold text-amber-200/90 hover:bg-white/5"
          aria-label="Back"
        >
          ←
        </button>
      ) : null}
      <h2 className="w-full text-center text-base font-black text-zinc-50">{title}</h2>
    </div>
  );
}

function RowButton({
  icon,
  title,
  subtitle,
  accent,
  onClick,
}: {
  icon: string;
  title: string;
  subtitle: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-transparent px-3 py-3 text-left transition hover:bg-white/[0.04]"
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base ${
          accent ? "bg-amber-400 text-zinc-950" : "bg-white/10 text-white"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-zinc-50">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs font-medium text-zinc-400">{subtitle}</p>
      </div>
      <span className="text-zinc-500">›</span>
    </button>
  );
}

export function LivePremiumWalletSheet({ open, onClose, liveRoomId: _liveRoomId, onReadinessChange }: Props) {
  const [step, setStep] = useState<Step>("main");
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState<BuyerWalletSummaryDTO | null>(null);
  const [addresses, setAddresses] = useState<AddrRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PmRow[]>([]);
  const [promoDraft, setPromoDraft] = useState("");
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [venmoBusy, setVenmoBusy] = useState(false);
  const [venmoError, setVenmoError] = useState<string | null>(null);

  const defaultAddress = useMemo(
    () => addresses.find((a) => a.isDefault) ?? addresses[0] ?? null,
    [addresses],
  );
  const defaultPm = useMemo(
    () => paymentMethods.find((p) => p.isDefault) ?? paymentMethods[0] ?? null,
    [paymentMethods],
  );

  const walletReady = wallet?.walletReady === true;
  const liveMethods = liveAcceptedWalletMethods(wallet?.capabilities ?? null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [walletRes, addrRes, pmRes] = await Promise.all([
        fetch("/api/account/wallet", { cache: "no-store", credentials: "include" }),
        fetch("/api/account/addresses", { cache: "no-store", credentials: "include" }),
        fetch("/api/account/payment-methods", { cache: "no-store", credentials: "include" }),
      ]);
      const walletJson = (await walletRes.json().catch(() => ({}))) as { wallet?: BuyerWalletSummaryDTO };
      const addrJson = (await addrRes.json().catch(() => ({}))) as { addresses?: AddrRow[] };
      const pmJson = (await pmRes.json().catch(() => ({}))) as { paymentMethods?: PmRow[] };
      const nextWallet = walletJson.wallet ?? null;
      setWallet(nextWallet);
      setAddresses(
        Array.isArray(addrJson.addresses)
          ? addrJson.addresses.filter((a) => !a.type || a.type === "shipping")
          : [],
      );
      setPaymentMethods(Array.isArray(pmJson.paymentMethods) ? pmJson.paymentMethods : []);
      onReadinessChange?.(nextWallet?.walletReady === true);
    } finally {
      setLoading(false);
    }
  }, [onReadinessChange]);

  useEffect(() => {
    if (!open) {
      setStep("main");
      setSaveNotice(null);
      return;
    }
    void reload();
  }, [open, reload]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleCardSaved = (pm: { id: string; brand: string; last4: string; expMonth: number; expYear: number }) => {
    setPaymentMethods((prev) => {
      if (prev.some((row) => row.id === pm.id)) return prev;
      return [{ ...pm, isDefault: prev.length === 0 }, ...prev.map((row) => ({ ...row, isDefault: false }))];
    });
    setSaveNotice("Payment method saved.");
    setStep("payment");
    void reload();
  };

  const handleAddressSaved = (address: WalletShippingAddressRow) => {
    setAddresses((prev) => [{ ...address, isDefault: true }, ...prev.map((row) => ({ ...row, isDefault: false }))]);
    setSaveNotice("Shipping address saved.");
    setStep("shipping");
    void reload();
  };

  const startVenmoSetup = useCallback(async () => {
    setVenmoBusy(true);
    setVenmoError(null);
    setSaveNotice(null);
    try {
      const res = await fetch("/api/account/payment-methods/venmo-setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = (await res.json().catch(() => ({}))) as {
        authorizeUrl?: string;
        paymentMethodId?: string;
        error?: string;
        issue?: string;
        debugId?: string;
      };
      if (!res.ok) {
        const detail = [j.error, j.issue ? `(${j.issue})` : null, j.debugId ? `debug ${j.debugId}` : null]
          .filter(Boolean)
          .join(" ");
        setVenmoError(detail || "Venmo linking is not available yet.");
        return;
      }
      if (typeof j.authorizeUrl === "string" && j.authorizeUrl.trim()) {
        window.location.assign(j.authorizeUrl.trim());
        return;
      }
      if (typeof j.paymentMethodId === "string" && j.paymentMethodId.trim()) {
        setSaveNotice("Venmo connected.");
        void reload();
        return;
      }
      setVenmoError("Venmo linking did not return a next step.");
    } catch {
      setVenmoError("Could not start Venmo linking.");
    } finally {
      setVenmoBusy(false);
    }
  }, [reload]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/72"
        aria-label="Close wallet"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={LIVE_PREMIUM_WALLET_TITLE}
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[22px] border border-amber-500/25 bg-[#0c0b10] shadow-[0_-4px_24px_rgba(201,162,39,0.12)] sm:rounded-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-11 shrink-0 rounded-full bg-white/20" />
        <div className="flex min-h-0 flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          {saveNotice ? (
            <p className="mb-2 rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-center text-xs font-semibold text-emerald-200">
              {saveNotice}
            </p>
          ) : null}

          {step === "main" ? (
            <>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute right-0 top-0 px-2 text-xl text-zinc-400 hover:text-zinc-200"
                  aria-label="Close"
                >
                  ×
                </button>
                <SheetHeader title={LIVE_PREMIUM_WALLET_TITLE} />
              </div>
              <div
                className={`mb-4 flex shrink-0 items-center justify-center gap-2 self-center rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide ${
                  walletReady
                    ? "border-emerald-500/35 bg-emerald-950/20 text-emerald-300"
                    : "border-amber-500/35 bg-amber-950/15 text-amber-200"
                }`}
              >
                {walletReady ? "Ready to bid & buy live" : "Complete setup to bid & buy"}
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
                <RowButton
                  icon="🚚"
                  title="Shipping"
                  subtitle={formatShipToLine(defaultAddress)}
                  onClick={() => {
                    setSaveNotice(null);
                    setStep("shipping");
                  }}
                />
                <RowButton
                  icon="💳"
                  title="Payment"
                  subtitle={
                    defaultPm
                      ? formatPaymentSummary(defaultPm)
                      : liveAcceptedMethodsLabel(wallet?.capabilities ?? null)
                  }
                  onClick={() => {
                    setSaveNotice(null);
                    setStep("payment");
                  }}
                />
                <RowButton
                  icon="✦"
                  title="Vault credits"
                  subtitle="Buyer protection, credits & show perks"
                  accent
                  onClick={() => setStep("premium")}
                />
                <div className="mt-4 flex gap-2 border-t border-white/[0.08] pt-4">
                  <input
                    value={promoDraft}
                    readOnly
                    placeholder="Promo Code"
                    className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/40 px-3 py-2.5 text-sm text-zinc-500 placeholder:text-zinc-600 outline-none"
                  />
                  <button
                    type="button"
                    disabled
                    className="rounded-lg bg-white/[0.08] px-4 text-sm font-extrabold text-zinc-500 opacity-60"
                  >
                    Apply
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Promo codes apply at checkout on eligible orders. In-wallet validation is coming soon.
                </p>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Live accepts {liveAcceptedMethodsLabel(wallet?.capabilities ?? null)}. Everything saves here without
                  leaving the show.
                </p>
                {loading ? <p className="text-center text-xs text-zinc-500">Refreshing…</p> : null}
              </div>
              <button
                type="button"
                onClick={walletReady ? onClose : () => setStep(!wallet?.shippingReady ? "shipping" : "payment")}
                className="mt-4 w-full shrink-0 rounded-xl bg-amber-400 py-3.5 text-sm font-black text-zinc-950"
              >
                {walletReady ? "Done" : "Finish setup"}
              </button>
            </>
          ) : null}

          {step === "shipping" ? (
            <>
              <SheetHeader title="Shipping" onBack={() => setStep("main")} />
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {defaultAddress ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="font-extrabold text-zinc-50">{defaultAddress.fullName}</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-zinc-400">
                      {defaultAddress.line1}
                      {defaultAddress.line2 ? `\n${defaultAddress.line2}` : ""}
                      {`\n${defaultAddress.city}, ${defaultAddress.state} ${defaultAddress.postalCode}`}
                    </p>
                    {defaultAddress.isDefault ? (
                      <span className="mt-2 inline-block rounded-full bg-emerald-950/30 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                        Default
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-amber-200">No shipping address on file yet.</p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSaveNotice(null);
                    setStep("add_shipping");
                  }}
                  className="mt-4 w-full rounded-xl border border-white/18 bg-white/[0.04] py-3 text-sm font-extrabold text-zinc-100"
                >
                  {addresses.length ? "Add another address" : "+ Add shipping address"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setStep("main")}
                className="mt-4 w-full shrink-0 rounded-xl bg-amber-400 py-3.5 text-sm font-black text-zinc-950"
              >
                Done
              </button>
            </>
          ) : null}

          {step === "add_shipping" ? (
            <>
              <SheetHeader title="Add shipping" onBack={() => setStep("shipping")} />
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <WalletInlineShippingForm
                  onSaved={handleAddressSaved}
                  onCancel={() => setStep("shipping")}
                />
              </div>
            </>
          ) : null}

          {step === "payment" ? (
            <>
              <SheetHeader title="Payment" onBack={() => setStep("main")} />
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">Saved</p>
                {paymentMethods.length === 0 ? (
                  <p className="text-sm font-semibold text-amber-200">No saved payment method yet.</p>
                ) : (
                  paymentMethods.map((pm) => (
                    <div
                      key={pm.id}
                      className={`mb-2 flex items-center gap-3 rounded-xl border px-3 py-3 ${
                        pm.isDefault ? "border-sky-500/80 bg-sky-950/20" : "border-white/12 bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-lg">
                        💳
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold text-zinc-50">{formatPaymentSummary(pm)}</p>
                        {pm.isDefault ? (
                          <p className="text-[10px] font-bold uppercase text-sky-300">Default</p>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
                <p className="mb-2 mt-4 text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
                  New payment method
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSaveNotice(null);
                    setVenmoError(null);
                    setStep("add_card");
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/18 bg-white/[0.04] py-3 text-sm font-extrabold text-zinc-100"
                >
                  Add card / Cash App
                </button>
                {wallet?.capabilities?.venmo ? (
                  <button
                    type="button"
                    disabled={venmoBusy}
                    onClick={() => void startVenmoSetup()}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/18 bg-white/[0.04] py-3 text-sm font-extrabold text-zinc-100 disabled:opacity-60"
                  >
                    {venmoBusy ? "Starting Venmo…" : "Connect Venmo"}
                  </button>
                ) : null}
                {venmoError ? <p className="mt-2 text-xs font-medium text-rose-300">{venmoError}</p> : null}
                <p className="mb-2 mt-5 text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
                  Accepted on live
                </p>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1">
                  {liveMethods.map((m) => (
                    <div key={m.id} className="border-b border-white/[0.06] py-2.5 last:border-0">
                      <p className="text-sm font-bold text-zinc-100">{m.label}</p>
                      <p className="text-xs text-zinc-500">Instant checkout for bids & buy-now</p>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStep("main")}
                className="mt-4 w-full shrink-0 rounded-xl bg-amber-400 py-3.5 text-sm font-black text-zinc-950"
              >
                Done
              </button>
            </>
          ) : null}

          {step === "add_card" ? (
            <>
              <SheetHeader title="Add card" onBack={() => setStep("payment")} />
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <WalletAddPaymentMethodForm
                  active={step === "add_card"}
                  onSaved={handleCardSaved}
                  onCancel={() => setStep("payment")}
                />
              </div>
            </>
          ) : null}

          {step === "premium" ? (
            <>
              <SheetHeader title="Vault credits" onBack={() => setStep("main")} />
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
                  <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-amber-400 text-2xl text-zinc-950">
                    ✦
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    Secure checkout for live bids, PYT spots, and instant buy-now — backed by Stripe.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Live payment methods</p>
                  <ul className="mt-2 space-y-1">
                    {liveMethods.map((m) => (
                      <li key={m.id} className="text-sm text-zinc-200">
                        · {m.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStep("main")}
                className="mt-4 w-full shrink-0 rounded-xl bg-amber-400 py-3.5 text-sm font-black text-zinc-950"
              >
                Done
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
