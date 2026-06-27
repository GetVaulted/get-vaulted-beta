"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { AddressAutocompleteFields } from "@/components/address/AddressAutocompleteFields";
import { WATCHLIST_TOAST_EVENT } from "@/lib/watchlist-events";

function combineAddressLine(line1: string, line2: string): string {
  return [line1, line2].filter(Boolean).join(" ");
}

type ApiPaymentMethod = { id: string; brand: string; last4: string; expMonth: number; expYear: number };

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

type PlaceBidResponse = {
  ok?: boolean;
  error?: string;
  currentBidUsd?: number;
  youAreLeader?: boolean;
};

export type MarketplacePlaceBidModalProps = {
  open: boolean;
  onClose: () => void;
  listingId: string;
  displayBidUsd: number;
  shippingLine: string;
  auctionEndsAt: string | null | undefined;
  auctionEnded: boolean;
  minNextBidUsd: number;
  /** Called after a successful bid, before the dialog closes (e.g. refresh listing data). */
  onPlaced?: () => void;
};

export function MarketplacePlaceBidModal({
  open,
  onClose,
  listingId,
  displayBidUsd,
  shippingLine,
  auctionEndsAt,
  auctionEnded,
  minNextBidUsd,
  onPlaced,
}: MarketplacePlaceBidModalProps) {
  const titleId = useId();
  const sheetTitleId = useId();

  const [maxBid, setMaxBid] = useState("");
  const [shipRecipientName, setShipRecipientName] = useState("");
  const [shipLine1, setShipLine1] = useState("");
  const [shipLine2, setShipLine2] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [shipState, setShipState] = useState("");
  const [shipZip, setShipZip] = useState("");
  const [shipCountry, setShipCountry] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<ApiPaymentMethod[] | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState(true);
  const [paymentSetupMessage, setPaymentSetupMessage] = useState<string | null>(null);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<
    Array<{ id: string; fullName: string; line1: string; line2: string | null; city: string; state: string; postalCode: string; country: string; type?: string }>
  >([]);
  const [buyerAddressId, setBuyerAddressId] = useState("");
  const [chargeAck, setChargeAck] = useState(false);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/account/addresses", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as { addresses?: Array<{ id: string; type?: string; isDefault?: boolean; fullName: string; line1: string; line2: string | null; city: string; state: string; postalCode: string; country: string }> };
      const rows = Array.isArray(j.addresses) ? j.addresses.filter((a) => a.type === "shipping") : [];
      if (cancelled) return;
      setSavedAddresses(rows);
      const preferred = rows.find((a) => a.isDefault) ?? rows[0];
      if (!preferred) return;
      setBuyerAddressId(preferred.id);
      setShipRecipientName(preferred.fullName ?? "");
      setShipLine1(preferred.line1 ?? "");
      setShipLine2(preferred.line2 ?? "");
      setShipCity(preferred.city ?? "");
      setShipState(preferred.state ?? "");
      setShipZip(preferred.postalCode ?? "");
      setShipCountry(preferred.country ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setMaxBid("");
      setShipRecipientName("");
      setShipLine1("");
      setShipLine2("");
      setShipCity("");
      setShipState("");
      setShipZip("");
      setShipCountry("");
      setSelectedPaymentMethodId("");
      setPaymentMethods(null);
      setPaymentSetupMessage(null);
      setStripeConfigured(true);
      setBuyerAddressId("");
      setChargeAck(false);
      setCheckoutOpen(false);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!checkoutOpen) return;
    let cancelled = false;
    setPaymentMethods(null);
    setPaymentSetupMessage(null);
    void (async () => {
      try {
        const res = await fetch("/api/account/payment-methods", { cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as {
          paymentMethods?: ApiPaymentMethod[];
          stripeConfigured?: boolean;
          message?: string;
        };
        if (cancelled) return;
        const configured = j.stripeConfigured !== false;
        setStripeConfigured(configured);
        if (typeof j.message === "string" && !configured) {
          setPaymentSetupMessage(j.message);
        }
        const list = Array.isArray(j.paymentMethods) ? j.paymentMethods : [];
        setPaymentMethods(list);
        setSelectedPaymentMethodId((prev) =>
          list.some((m) => m.id === prev) ? prev : (list[0]?.id ?? ""),
        );
      } catch {
        if (!cancelled) {
          setPaymentMethods([]);
          setStripeConfigured(false);
          setPaymentSetupMessage("Could not load payment methods.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkoutOpen]);

  const timeLeft =
    auctionEnded || !auctionEndsAt
      ? auctionEnded
        ? "Ended"
        : "—"
      : formatCountdown(new Date(auctionEndsAt).getTime() - now);

  if (!open) return null;

  const parseMax = (): number | null => {
    const n = Number(String(maxBid).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  };

  const openCheckout = () => {
    setError(null);
    const n = parseMax();
    if (n == null) {
      setError("Enter your max bid.");
      return;
    }
    if (n < minNextBidUsd) {
      setError(`Your max bid must be at least ${formatMoney(minNextBidUsd)}.`);
      return;
    }
    setCheckoutOpen(true);
  };

  const handleConfirmBid = async () => {
    setError(null);
    const n = parseMax();
    if (n == null || n < minNextBidUsd) {
      setError("Enter a valid max bid.");
      setCheckoutOpen(false);
      return;
    }
    if (
      !shipRecipientName.trim() ||
      !shipLine1.trim() ||
      !shipCity.trim() ||
      !shipState.trim() ||
      !shipZip.trim() ||
      !shipCountry.trim()
    ) {
      setError("Complete all shipping fields.");
      return;
    }
    if (!chargeAck) {
      setError("Confirm the authorization checkbox to place your bid.");
      return;
    }
    if (!paymentMethods || paymentMethods.length === 0 || !selectedPaymentMethodId) {
      setError("Add a saved payment method in Wallet before placing a bid.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          maxBidUsd: n,
          checkout: {
            shipRecipientName: shipRecipientName.trim(),
            shipAddress: combineAddressLine(shipLine1, shipLine2).trim(),
            shipCity: shipCity.trim(),
            shipState: shipState.trim(),
            shipZip: shipZip.trim(),
            shipCountry: shipCountry.trim(),
            paymentMethodId: selectedPaymentMethodId,
            buyerAddressId: buyerAddressId || undefined,
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as PlaceBidResponse;
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not place bid.");
        return;
      }
      const publicPrice =
        typeof data.currentBidUsd === "number" && Number.isFinite(data.currentBidUsd)
          ? data.currentBidUsd
          : displayBidUsd;
      const leader = data.youAreLeader === true;
      const toastMsg = leader
        ? `You're the highest bidder at ${formatMoney(publicPrice)}`
        : "You've been outbid. Try a higher max bid.";
      window.dispatchEvent(new CustomEvent(WATCHLIST_TOAST_EVENT, { detail: { message: toastMsg } }));
      onPlaced?.();
      onClose();
      window.dispatchEvent(new Event("gv-listings-updated"));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "h-9 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-2.5 text-xs text-foreground outline-none placeholder:text-zinc-600 focus:border-gold/40 focus:ring-1 focus:ring-gold/25 disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-[1] flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0a0a0d] shadow-[0_24px_64px_-20px_rgba(0,0,0,0.9)] ${
          checkoutOpen ? "min-h-[min(88dvh,700px)] max-h-[min(96dvh,860px)]" : ""
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          aria-label="Close"
          className="absolute right-2 top-2 z-[35] inline-flex size-10 items-center justify-center rounded-full border border-white/[0.08] bg-[#0a0a0d]/90 text-zinc-400 shadow-sm backdrop-blur-sm transition hover:border-white/15 hover:bg-white/[0.06] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {/* Dim + tap to dismiss sheet */}
        {checkoutOpen ? (
          <button
            type="button"
            aria-label="Back to bid"
            className="absolute inset-0 z-10 bg-black/45 transition-opacity duration-200"
            onClick={() => {
              setCheckoutOpen(false);
              setError(null);
            }}
          />
        ) : null}

        {/* Main (short) step */}
        <div
          className={`relative z-0 px-5 pb-6 pt-3 pr-12 sm:px-6 sm:pb-7 sm:pt-4 sm:pr-14 ${checkoutOpen ? "pointer-events-none select-none" : ""}`}
        >
          <h2 id={titleId} className="font-display text-lg font-bold text-foreground">
            Place your max bid
          </h2>
          <p className="mt-2 text-sm leading-snug text-zinc-300">
            Enter the most you&apos;re willing to pay. We&apos;ll bid only as much as needed to keep you winning.
          </p>

          <div className="mt-4 space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-zinc-500">Current bid</span>
              <span className="font-mono font-semibold tabular-nums text-gold-bright">{formatMoney(displayBidUsd)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-zinc-500">Shipping</span>
              <span className="text-right text-xs font-medium leading-snug text-zinc-200">{shippingLine}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-zinc-500">Time left</span>
              <span className="font-mono text-xs font-semibold tabular-nums text-rose-200">{timeLeft}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-white/[0.06] pt-2">
              <span className="text-zinc-500">Minimum next bid</span>
              <span className="font-mono font-semibold tabular-nums text-zinc-100">{formatMoney(minNextBidUsd)}</span>
            </div>
          </div>

          <div className="mt-5 space-y-1.5">
            <label htmlFor="place-bid-max" className="text-xs font-medium text-zinc-300">
              Your max bid (USD)
            </label>
            <input
              id="place-bid-max"
              inputMode="decimal"
              value={maxBid}
              disabled={submitting || checkoutOpen}
              onChange={(e) => {
                setMaxBid(e.target.value);
                setError(null);
              }}
              className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3.5 text-sm text-foreground outline-none ring-gold/20 placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2 disabled:opacity-50"
              placeholder={formatMoney(minNextBidUsd)}
              autoComplete="off"
            />
          </div>

          <p className="mt-3 text-[11px] leading-snug text-zinc-500">
            Next: confirm shipping and your saved payment method for secure checkout if you win.
          </p>

          {!checkoutOpen && error ? <p className="mt-2 text-xs font-medium text-rose-300">{error}</p> : null}

          <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/[0.14] px-6 text-sm font-semibold text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.04] sm:min-w-[7rem] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting || checkoutOpen}
              onClick={openCheckout}
              className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_0_24px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-60 sm:min-w-[10rem]"
            >
              Shipping & payment
            </button>
          </div>
        </div>

        {/* Slide-up checkout prompt */}
        <div
          className={`absolute inset-x-0 bottom-0 z-20 flex max-h-[min(94dvh,820px)] flex-col rounded-t-2xl border border-white/[0.12] border-b-0 bg-[#0c0c10] shadow-[0_-20px_50px_-12px_rgba(0,0,0,0.85)] transition-transform duration-300 ease-out ${
            checkoutOpen ? "pointer-events-auto translate-y-0" : "pointer-events-none translate-y-full"
          }`}
          role="region"
          aria-labelledby={sheetTitleId}
          aria-hidden={!checkoutOpen}
        >
          <div className="shrink-0 border-b border-white/[0.06] px-4 pb-2 pt-3">
            <div className="flex items-start justify-between gap-2">
              <h3 id={sheetTitleId} className="min-w-0 pr-2 text-sm font-bold text-zinc-100">
                Confirm your details
              </h3>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setCheckoutOpen(false);
                    setError(null);
                  }}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onClose}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.06] hover:text-zinc-50 disabled:opacity-50"
                >
                  Close
                </button>
              </div>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-zinc-500">
              If you win, we&apos;ll ship to this address. You authorize Get Vaulted to charge the payment method you
              select for the winning bid plus shipping when the auction closes.
            </p>
          </div>

          <div className="px-4 pb-6 pt-3">
            <div className="grid grid-cols-2 gap-2">
              {savedAddresses.length > 0 ? (
                <label className="col-span-2">
                  <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Saved address
                  </span>
                  <select
                    value={buyerAddressId}
                    disabled={submitting}
                    onChange={(e) => {
                      const id = e.target.value;
                      setBuyerAddressId(id);
                      const selected = savedAddresses.find((a) => a.id === id);
                      if (!selected) return;
                      setShipRecipientName(selected.fullName ?? "");
                      setShipLine1(selected.line1 ?? "");
                      setShipLine2(selected.line2 ?? "");
                      setShipCity(selected.city ?? "");
                      setShipState(selected.state ?? "");
                      setShipZip(selected.postalCode ?? "");
                      setShipCountry(selected.country ?? "");
                    }}
                    className="h-9 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-2 text-xs text-foreground outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/25 disabled:opacity-50"
                  >
                    <option value="">Manual entry</option>
                    {savedAddresses.map((addr) => (
                      <option key={addr.id} value={addr.id}>
                        {addr.fullName} - {addr.city}, {addr.state}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="col-span-2">
                <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">Name</span>
                <input
                  value={shipRecipientName}
                  disabled={submitting}
                  onChange={(e) => setShipRecipientName(e.target.value)}
                  className={inputClass}
                  autoComplete="shipping name"
                />
              </label>
              <AddressAutocompleteFields
                values={{
                  line1: shipLine1,
                  line2: shipLine2,
                  city: shipCity,
                  state: shipState,
                  postalCode: shipZip,
                  country: shipCountry || "US",
                }}
                disabled={submitting}
                onChange={(field, value) => {
                  if (field === "line1") setShipLine1(value);
                  if (field === "line2") setShipLine2(value);
                  if (field === "city") setShipCity(value);
                  if (field === "state") setShipState(value);
                  if (field === "postalCode") setShipZip(value);
                  if (field === "country") setShipCountry(value);
                }}
                line1Label="Street"
                className="contents sm:contents"
                labelClassName="col-span-2 mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                inputClassName={inputClass}
              />
              <p className="col-span-2 text-[11px] leading-snug text-zinc-500">
                Start typing your street address for suggestions. Pick a match so city, state, and ZIP fill in automatically.
              </p>
              <div className="col-span-2 space-y-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Secure checkout</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                    Payment if you win — you are only charged if you win the auction.
                  </p>
                  {paymentSetupMessage && !stripeConfigured ? (
                    <p className="mt-2 text-[11px] leading-snug text-amber-200/90">{paymentSetupMessage}</p>
                  ) : null}
                </div>
                {paymentMethods === null ? (
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-4 text-center text-xs text-zinc-500">
                    Loading payment methods…
                  </div>
                ) : paymentMethods.length === 0 ? (
                  <div className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-5 text-center">
                    <p className="text-sm font-medium text-zinc-200">No payment method added yet</p>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                      Add a saved card in Wallet to use for auction wins and purchases.
                    </p>
                    <Link
                      href="/account/payment-methods"
                      className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-gold/35 bg-gold/10 px-5 text-xs font-bold uppercase tracking-wide text-gold-bright transition hover:border-gold/50 hover:bg-gold/15"
                    >
                      Add payment method
                    </Link>
                  </div>
                ) : (
                  <fieldset disabled={submitting} className="space-y-2">
                    <legend className="sr-only">Saved payment method</legend>
                    {paymentMethods.map((row) => {
                      const sel = selectedPaymentMethodId === row.id;
                      const line1 = `${row.brand} ···· ${row.last4}`;
                      const line2 =
                        row.expMonth && row.expYear
                          ? `Expires ${String(row.expMonth).padStart(2, "0")}/${String(row.expYear).slice(-2)}`
                          : "Saved payment method";
                      return (
                        <label
                          key={row.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                            sel
                              ? "border-gold/45 bg-gold/[0.08] ring-1 ring-gold/25"
                              : "border-white/[0.08] bg-white/[0.02] hover:border-white/15"
                          }`}
                        >
                          <input
                            type="radio"
                            name="auction-payment-method"
                            className="mt-1 size-3.5 accent-gold"
                            checked={sel}
                            onChange={() => setSelectedPaymentMethodId(row.id)}
                          />
                          <span className="min-w-0 text-left">
                            <span className="block text-xs font-semibold text-zinc-100">{line1}</span>
                            <span className="mt-0.5 block text-[11px] text-zinc-500">{line2}</span>
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>
                )}
              </div>
            </div>

            <label className="mt-3 flex cursor-pointer gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5">
              <input
                type="checkbox"
                checked={chargeAck}
                disabled={submitting}
                onChange={(e) => {
                  setChargeAck(e.target.checked);
                  setError(null);
                }}
                className="mt-0.5 size-3.5 shrink-0 rounded border-white/20 bg-[#0c0c10] text-gold focus:ring-gold/40"
              />
              <span className="text-[11px] leading-snug text-zinc-400">
                I confirm these details and authorize Get Vaulted to charge my selected payment method for the winning bid
                plus shipping if I win this auction.
              </span>
            </label>

            {checkoutOpen && error ? <p className="mt-2 text-xs font-medium text-rose-300">{error}</p> : null}

            <button
              type="button"
              disabled={
                submitting ||
                paymentMethods === null ||
                paymentMethods.length === 0 ||
                !selectedPaymentMethodId ||
                !paymentMethods.some((m) => m.id === selectedPaymentMethodId)
              }
              onClick={() => void handleConfirmBid()}
              className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 shadow-[0_0_24px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
            >
              {submitting ? "Confirming…" : "Confirm max bid"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
