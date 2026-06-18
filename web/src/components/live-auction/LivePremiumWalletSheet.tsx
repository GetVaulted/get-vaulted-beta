"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BuyerWalletSummaryDTO } from "@/lib/buyer-wallet";
import {
  LIVE_PREMIUM_WALLET_TITLE,
  formatPaymentSummary,
  formatShipToLine,
  liveAcceptedMethodsLabel,
  liveAcceptedWalletMethods,
} from "@/lib/live-premium-wallet";

type Step = "main" | "shipping" | "payment" | "premium";

type AddrRow = {
  id: string;
  type?: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault?: boolean;
};

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
    <div className="relative mb-3 flex min-h-9 items-center">
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

export function LivePremiumWalletSheet({ open, onClose, liveRoomId, onReadinessChange }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("main");
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState<BuyerWalletSummaryDTO | null>(null);
  const [addresses, setAddresses] = useState<AddrRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PmRow[]>([]);
  const [promoDraft, setPromoDraft] = useState("");

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
        fetch("/api/account/wallet", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/account/addresses", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/account/payment-methods", { cache: "no-store", credentials: "same-origin" }),
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
      return;
    }
    void reload();
  }, [open, reload]);

  const goAccountPayment = () => {
    onClose();
    router.push(`/account/payment-methods?return=${encodeURIComponent(`/live/${liveRoomId}`)}`);
  };

  const goAccountShipping = () => {
    onClose();
    router.push("/account/payment-methods#wallet-shipping");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/72">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-hidden rounded-t-[22px] border border-amber-500/25 bg-[#0c0b10] shadow-[0_-4px_24px_rgba(201,162,39,0.12)]">
        <div className="mx-auto mt-2 h-1 w-11 rounded-full bg-white/20" />
        <div className="relative flex max-h-[calc(92vh-12px)] flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          {step === "main" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="absolute right-1 top-2 z-10 px-2 text-xl text-zinc-400 hover:text-zinc-200"
                aria-label="Close"
              >
                ×
              </button>
              <SheetHeader title={LIVE_PREMIUM_WALLET_TITLE} />
              <div
                className={`mb-4 flex items-center justify-center gap-2 self-center rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide ${
                  walletReady
                    ? "border-emerald-500/35 bg-emerald-950/20 text-emerald-300"
                    : "border-amber-500/35 bg-amber-950/15 text-amber-200"
                }`}
              >
                {walletReady ? "Ready to bid & buy live" : "Complete setup to bid & buy"}
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                <RowButton
                  icon="🚚"
                  title="Shipping"
                  subtitle={formatShipToLine(defaultAddress)}
                  onClick={() => setStep("shipping")}
                />
                <RowButton
                  icon="💳"
                  title="Payment"
                  subtitle={
                    defaultPm
                      ? formatPaymentSummary(defaultPm)
                      : liveAcceptedMethodsLabel(wallet?.capabilities ?? null)
                  }
                  onClick={() => setStep("payment")}
                />
                <RowButton
                  icon="✦"
                  title="Get Vaulted Premium"
                  subtitle="Buyer protection, credits & show perks"
                  accent
                  onClick={() => setStep("premium")}
                />
                <div className="mt-4 flex gap-2 border-t border-white/[0.08] pt-4">
                  <input
                    value={promoDraft}
                    onChange={(e) => setPromoDraft(e.target.value)}
                    placeholder="Promo Code"
                    className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/40 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-amber-400/40"
                  />
                  <button
                    type="button"
                    disabled={!promoDraft.trim()}
                    className="rounded-lg px-4 text-sm font-extrabold text-zinc-400 disabled:opacity-40 enabled:bg-amber-400 enabled:text-zinc-950"
                  >
                    Apply
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Live accepts {liveAcceptedMethodsLabel(wallet?.capabilities ?? null)}.
                </p>
                {loading ? <p className="text-center text-xs text-zinc-500">Refreshing…</p> : null}
              </div>
              <button
                type="button"
                onClick={walletReady ? onClose : () => setStep(!wallet?.shippingReady ? "shipping" : "payment")}
                className="mt-4 w-full rounded-xl bg-amber-400 py-3.5 text-sm font-black text-zinc-950"
              >
                {walletReady ? "Done" : "Finish setup"}
              </button>
            </>
          ) : null}

          {step === "shipping" ? (
            <>
              <SheetHeader title="Shipping" onBack={() => setStep("main")} />
              <div className="min-h-0 flex-1 overflow-y-auto">
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
                  onClick={goAccountShipping}
                  className="mt-4 text-sm font-extrabold text-amber-300 hover:underline"
                >
                  {addresses.length ? "Manage addresses" : "+ Add address"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setStep("main")}
                className="mt-4 w-full rounded-xl bg-amber-400 py-3.5 text-sm font-black text-zinc-950"
              >
                Done
              </button>
            </>
          ) : null}

          {step === "payment" ? (
            <>
              <SheetHeader title="Payment" onBack={() => setStep("main")} />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">Saved</p>
                {paymentMethods.length === 0 ? (
                  <p className="text-sm font-semibold text-amber-200">No saved payment method yet.</p>
                ) : (
                  paymentMethods.map((pm) => (
                    <div
                      key={pm.id}
                      className={`mb-2 flex items-center gap-3 rounded-xl border px-3 py-3 ${
                        pm.isDefault
                          ? "border-sky-500/80 bg-sky-950/20"
                          : "border-white/12 bg-white/[0.03]"
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
                  onClick={goAccountPayment}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/18 bg-white/[0.04] py-3 text-sm font-extrabold text-zinc-100"
                >
                  New card
                </button>
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
                className="mt-4 w-full rounded-xl bg-amber-400 py-3.5 text-sm font-black text-zinc-950"
              >
                Done
              </button>
            </>
          ) : null}

          {step === "premium" ? (
            <>
              <SheetHeader title="Get Vaulted Premium" onBack={() => setStep("main")} />
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
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
                className="mt-4 w-full rounded-xl bg-amber-400 py-3.5 text-sm font-black text-zinc-950"
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
