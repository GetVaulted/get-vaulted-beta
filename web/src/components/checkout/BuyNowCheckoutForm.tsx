"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LiveShippingIndicator } from "@/components/live-auction/LiveShippingIndicator";
import { VaultedSecureCheckoutPanel } from "@/components/checkout/VaultedSecureCheckoutPanel";
import { CheckoutTrustStrip, PAYMENT_NOTE, SALES_TAX_NOTE } from "@/components/checkout/CheckoutTrustStrip";
import { ESCROW_THRESHOLD_USD, estimateEscrowFeeCents, orderTotalQualifiesForEscrow } from "@/lib/escrow-config";
import {
  checkoutRatePreferenceKey,
  getBuyerPreferredShippingRateKey,
  pickCheckoutShippingRate,
  setBuyerPreferredShippingRateKey,
} from "@/lib/buyer-shipping-preference";
import { VAULTED_SECURE_CHECKOUT } from "@/lib/vaulted-secure-checkout-copy";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatRatePrice(amount: string, currency: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

type CheckoutShippingRate = {
  id: string;
  carrier: string;
  serviceLevel: string;
  estimatedDelivery: string;
  amount: string;
  currency: string;
};

export type CheckoutListingSnapshot = {
  id: string;
  title: string;
  imageUrl: string | null;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  handlingEstimate: string;
  shipsFromRegion: string | null;
  trackingAfterPurchaseLine: string;
};

function CheckoutStep({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0d]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 sm:px-5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-gold-bright">
          {step}
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-zinc-100">{title}</h2>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function OrderSummaryCard({
  listing,
  shippingPriceUsd,
  shippingReady,
  ratesLoading,
  usesFlatShipping,
  liveRoomItemId,
  taxLineValue,
  taxLoading,
  total,
  summaryReady,
  itemOnlyTotal,
}: {
  listing: CheckoutListingSnapshot;
  shippingPriceUsd: number;
  shippingReady: boolean;
  ratesLoading: boolean;
  usesFlatShipping: boolean;
  liveRoomItemId: string | null;
  taxLineValue: string;
  taxLoading: boolean;
  total: number;
  summaryReady: boolean;
  itemOnlyTotal: number;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#08080a]/95 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
      <div className="flex gap-3">
        <div className="size-[72px] shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-[#0b0b0e]">
          {listing.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">No image</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">{listing.title}</p>
          <p className="mt-1.5 font-mono text-base font-bold text-gold-bright">{formatMoney(listing.itemPriceUsd)}</p>
        </div>
      </div>

      <dl className="mt-4 space-y-2 border-t border-white/[0.06] pt-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Item price</dt>
          <dd className="font-mono font-semibold text-zinc-200">{formatMoney(listing.itemPriceUsd)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Shipping</dt>
          <dd className="font-mono font-semibold text-zinc-200">
            {!shippingReady && !usesFlatShipping && !liveRoomItemId
              ? "Select option"
              : ratesLoading && !usesFlatShipping
                ? "Calculating…"
                : formatMoney(shippingPriceUsd)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Sales tax</dt>
          <dd className="font-mono font-semibold text-zinc-200">{taxLoading ? "Calculating…" : taxLineValue}</dd>
        </div>
        <p className="text-[11px] leading-snug text-zinc-500">{SALES_TAX_NOTE}</p>
        <div className="flex justify-between gap-3 border-t border-white/[0.06] pt-3">
          <dt className="font-semibold text-zinc-300">Total</dt>
          <dd className="font-mono text-lg font-bold text-gold-bright">
            {summaryReady ? formatMoney(total) : formatMoney(itemOnlyTotal)}
          </dd>
        </div>
        {!summaryReady ? (
          <p className="text-[11px] leading-snug text-zinc-500">
            Complete address and shipping to see your full total.
          </p>
        ) : null}
      </dl>

      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <CheckoutTrustStrip compact />
      </div>
    </div>
  );
}

export function BuyNowCheckoutForm({
  listing,
  liveRoomItemId = null,
  returnLiveRoomId = null,
}: {
  listing: CheckoutListingSnapshot;
  liveRoomItemId?: string | null;
  returnLiveRoomId?: string | null;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<
    Array<{ id: string; fullName: string; line1: string; line2: string | null; city: string; state: string; postalCode: string; country: string; type?: string }>
  >([]);
  const [buyerAddressId, setBuyerAddressId] = useState("");
  const [taxUsd, setTaxUsd] = useState(0);
  const [taxCollect, setTaxCollect] = useState(false);
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxNote, setTaxNote] = useState<string | null>(null);
  const usesFlatShipping = listing.shippingPriceUsd > 0;
  const [shippingPriceUsd, setShippingPriceUsd] = useState(listing.shippingPriceUsd);
  const [shippingRates, setShippingRates] = useState<CheckoutShippingRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [ratesExpanded, setRatesExpanded] = useState(false);
  const [hasSavedAddress, setHasSavedAddress] = useState(false);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);

  const selectShippingRate = (rate: CheckoutShippingRate) => {
    setSelectedRateId(rate.id);
    setBuyerPreferredShippingRateKey(checkoutRatePreferenceKey(rate));
    setRatesExpanded(false);
  };

  const preferredAddress = savedAddresses.find((a) => a.id === buyerAddressId) ?? savedAddresses[0] ?? null;
  const addressSummary = preferredAddress
    ? [preferredAddress.fullName, preferredAddress.line1, `${preferredAddress.city}, ${preferredAddress.state} ${preferredAddress.postalCode}`]
        .filter(Boolean)
        .join(" · ")
    : "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/account/addresses", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as { addresses?: Array<{ id: string; type?: string; isDefault?: boolean; fullName: string; line1: string; line2: string | null; city: string; state: string; postalCode: string; country: string }> };
      const rows = Array.isArray(j.addresses) ? j.addresses.filter((a) => a.type === "shipping") : [];
      if (cancelled) return;
      setSavedAddresses(rows);
      setHasSavedAddress(rows.length > 0);
      const preferred = rows.find((a) => a.isDefault) ?? rows[0];
      if (preferred) {
        setBuyerAddressId(preferred.id);
        setName(preferred.fullName ?? "");
        setAddress([preferred.line1, preferred.line2].filter(Boolean).join(" "));
        setCity(preferred.city ?? "");
        setState(preferred.state ?? "");
        setZip(preferred.postalCode ?? "");
        setCountry(preferred.country ?? "");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (usesFlatShipping || liveRoomItemId) {
      setShippingPriceUsd(listing.shippingPriceUsd);
      setShippingRates([]);
      setSelectedRateId(null);
      setRatesError(null);
      return;
    }
    if (!address.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      setShippingRates([]);
      setSelectedRateId(null);
      setShippingPriceUsd(0);
      setRatesError(null);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setRatesLoading(true);
        setRatesError(null);
        try {
          const res = await fetch("/api/checkout/shipping-rates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              listingId: listing.id,
              buyerAddressId: buyerAddressId || undefined,
              shipping: {
                shipRecipientName: name,
                shipAddress: address,
                shipCity: city,
                shipState: state,
                shipZip: zip,
                shipCountry: country || "US",
              },
            }),
          });
          const j = (await res.json().catch(() => ({}))) as {
            rates?: CheckoutShippingRate[];
            error?: string;
          };
          const rates = Array.isArray(j.rates) ? j.rates : [];
          setShippingRates(rates);
          if (res.ok && rates.length === 0) {
            setRatesError(j.error ?? "No shipping options are available for this address yet.");
          } else {
            setRatesError(res.ok ? null : j.error ?? "Shipping rates could not be loaded.");
          }
          const preferredKey = getBuyerPreferredShippingRateKey();
          const picked = pickCheckoutShippingRate(rates, preferredKey);
          setSelectedRateId((prev) => (prev && rates.some((r) => r.id === prev) ? prev : picked?.id ?? null));
          if (rates.length > 1) setRatesExpanded(true);
        } finally {
          setRatesLoading(false);
        }
      })();
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    address,
    buyerAddressId,
    city,
    country,
    listing.id,
    listing.shippingPriceUsd,
    liveRoomItemId,
    name,
    state,
    usesFlatShipping,
    zip,
  ]);

  useEffect(() => {
    if (usesFlatShipping || liveRoomItemId) return;
    const picked = shippingRates.find((r) => r.id === selectedRateId);
    setShippingPriceUsd(picked ? Number(picked.amount) || 0 : 0);
  }, [liveRoomItemId, selectedRateId, shippingRates, usesFlatShipping]);

  useEffect(() => {
    if (!address.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      setTaxUsd(0);
      setTaxCollect(false);
      setTaxNote(null);
      return;
    }
    if (!usesFlatShipping && !liveRoomItemId && shippingPriceUsd <= 0) {
      setTaxUsd(0);
      setTaxCollect(false);
      setTaxNote(null);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setTaxLoading(true);
        try {
          const res = await fetch("/api/checkout/tax-estimate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemPriceUsd: listing.itemPriceUsd,
              shippingPriceUsd,
              shipping: {
                shipRecipientName: name,
                shipAddress: address,
                shipCity: city,
                shipState: state,
                shipZip: zip,
                shipCountry: country || "US",
              },
            }),
          });
          const j = (await res.json().catch(() => ({}))) as {
            taxUsd?: number;
            collectTax?: boolean;
            note?: string;
            error?: string;
          };
          if (res.ok) {
            setTaxUsd(typeof j.taxUsd === "number" ? j.taxUsd : 0);
            setTaxCollect(Boolean(j.collectTax));
            setTaxNote(typeof j.note === "string" ? j.note : null);
          } else {
            setTaxUsd(0);
            setTaxCollect(false);
            setTaxNote(j.error ?? "Tax unavailable right now.");
          }
        } finally {
          setTaxLoading(false);
        }
      })();
    }, 400);
    return () => window.clearTimeout(t);
  }, [address, city, state, zip, country, name, listing.itemPriceUsd, liveRoomItemId, selectedRateId, shippingPriceUsd, usesFlatShipping]);

  const subtotal = useMemo(
    () => listing.itemPriceUsd + shippingPriceUsd,
    [listing.itemPriceUsd, shippingPriceUsd],
  );

  const total = useMemo(() => subtotal + (taxCollect ? taxUsd : 0), [subtotal, taxCollect, taxUsd]);
  const selectedRate = shippingRates.find((r) => r.id === selectedRateId) ?? null;
  const addressReady = Boolean(address.trim() && city.trim() && state.trim() && zip.trim());
  const shippingReady = usesFlatShipping || Boolean(liveRoomItemId) || Boolean(selectedRateId);
  const summaryReady = addressReady && shippingReady;
  const showRatePicker =
    ratesExpanded || shippingRates.length > 1 || (shippingRates.length > 0 && !selectedRate);

  const taxLineValue = (() => {
    if (!summaryReady) return "—";
    if (taxCollect && taxUsd > 0) return formatMoney(taxUsd);
    if (taxCollect && taxNote && taxNote !== SALES_TAX_NOTE) return taxNote;
    if (taxCollect) return formatMoney(taxUsd);
    return "—";
  })();

  const useVaultedSecureCheckout = orderTotalQualifiesForEscrow(subtotal);
  const secureFeeCents = useMemo(() => estimateEscrowFeeCents(subtotal), [subtotal]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!usesFlatShipping && !liveRoomItemId && !selectedRateId) {
      setError(ratesError ?? "Select a shipping option to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const successPath =
        returnLiveRoomId != null
          ? `/live/${encodeURIComponent(returnLiveRoomId)}`
          : `/account/orders`;
      const cancelPath =
        returnLiveRoomId != null
          ? `/live/${encodeURIComponent(returnLiveRoomId)}`
          : `/checkout/${encodeURIComponent(listing.id)}${liveRoomItemId ? `?liveItem=${encodeURIComponent(liveRoomItemId)}` : ""}`;

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "buy_now",
          listingId: listing.id,
          ...(liveRoomItemId ? { liveRoomItemId } : {}),
          shipping: {
            buyerAddressId: buyerAddressId || undefined,
            shipRecipientName: name,
            shipAddress: address,
            shipCity: city,
            shipState: state,
            shipZip: zip,
            shipCountry: country,
            selectedShippingRateId: selectedRateId || undefined,
          },
          selectedShippingRateId: selectedRateId || undefined,
          successPath,
          cancelPath,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) {
        setError(data.error ?? "Purchase failed.");
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
      setSubmitting(false);
    }
  };

  const shipsCheckout =
    listing.shipsFromRegion?.trim() ||
    "Seller region is confirmed on the order after you pay (US sellers ship from their verified address).";

  const summaryProps = {
    listing,
    shippingPriceUsd,
    shippingReady,
    ratesLoading,
    usesFlatShipping,
    liveRoomItemId,
    taxLineValue,
    taxLoading,
    total,
    summaryReady,
    itemOnlyTotal: listing.itemPriceUsd,
  };

  const completeLabel = submitting
    ? "Processing…"
    : useVaultedSecureCheckout
      ? VAULTED_SECURE_CHECKOUT.cta
      : "Complete purchase";

  return (
    <>
      <form id="buy-now-checkout-form" onSubmit={onSubmit} className="mx-auto max-w-6xl">
        <div className="mb-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileSummaryOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#08080a]/95 px-4 py-3 text-left"
            aria-expanded={mobileSummaryOpen}
          >
            <span className="text-sm font-semibold text-zinc-200">Order summary</span>
            <span className="font-mono text-base font-bold text-gold-bright">
              {summaryReady ? formatMoney(total) : formatMoney(listing.itemPriceUsd)}
            </span>
          </button>
          {mobileSummaryOpen ? (
            <div className="mt-2">
              <OrderSummaryCard {...summaryProps} />
            </div>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <aside className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Order summary</p>
            <OrderSummaryCard {...summaryProps} />
          </aside>

          <div className="min-w-0 space-y-4 pb-4">
            {returnLiveRoomId ? (
              <LiveShippingIndicator liveShowId={returnLiveRoomId} pollMs={0} className="border border-zinc-800 bg-[#08080a]/90" />
            ) : null}

            {!hasSavedAddress ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 px-4 py-3">
                <p className="text-xs leading-snug text-zinc-400">
                  Save a shipping address in your Wallet for faster checkout.{" "}
                  <Link href="/account/payment-methods#wallet-shipping" className="font-semibold text-gold-bright hover:underline">
                    Add address →
                  </Link>
                </p>
              </div>
            ) : null}

            <CheckoutStep step={1} title="Shipping address">
              <div className="flex items-center justify-between gap-3">
                {hasSavedAddress && !addressExpanded ? (
                  <button
                    type="button"
                    onClick={() => setAddressExpanded(true)}
                    className="ml-auto text-xs font-semibold text-gold-bright hover:underline"
                  >
                    Change
                  </button>
                ) : addressExpanded ? (
                  <button
                    type="button"
                    onClick={() => setAddressExpanded(false)}
                    className="ml-auto text-xs font-semibold text-gold-bright hover:underline"
                  >
                    Done
                  </button>
                ) : null}
              </div>
              {hasSavedAddress && !addressExpanded && preferredAddress ? (
                <p className="rounded-lg border border-white/[0.08] bg-[#0c0c10] px-3 py-2.5 text-sm leading-snug text-zinc-300">
                  {addressSummary}
                </p>
              ) : (
                <>
                  {savedAddresses.length > 0 ? (
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-zinc-400">Saved address</span>
                      <select
                        value={buyerAddressId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setBuyerAddressId(id);
                          const selected = savedAddresses.find((a) => a.id === id);
                          if (!selected) return;
                          setName(selected.fullName ?? "");
                          setAddress([selected.line1, selected.line2].filter(Boolean).join(" "));
                          setCity(selected.city ?? "");
                          setState(selected.state ?? "");
                          setZip(selected.postalCode ?? "");
                          setCountry(selected.country ?? "");
                          setAddressExpanded(false);
                        }}
                        className="h-10 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
                      >
                        <option value="">Use manual entry</option>
                        {savedAddresses.map((addr) => (
                          <option key={addr.id} value={addr.id}>
                            {addr.fullName} - {addr.city}, {addr.state}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    <label className="sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-zinc-400">Full name</span>
                      <input
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-10 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-zinc-400">Street address</span>
                      <input
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="h-10 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-zinc-400">City</span>
                      <input
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="h-10 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-zinc-400">State / Province</span>
                      <input
                        required
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="h-10 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-zinc-400">ZIP / Postal code</span>
                      <input
                        required
                        value={zip}
                        onChange={(e) => setZip(e.target.value)}
                        className="h-10 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-zinc-400">Country</span>
                      <input
                        required
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="h-10 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
                      />
                    </label>
                  </div>
                </>
              )}
            </CheckoutStep>

            <CheckoutStep step={2} title="Shipping method">
              {usesFlatShipping || liveRoomItemId ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-gold/25 bg-gold/[0.06] px-3 py-2.5">
                    <span className="text-sm font-medium text-zinc-200">Standard shipping</span>
                    <span className="font-mono text-sm font-bold text-gold-bright">{formatMoney(shippingPriceUsd)}</span>
                  </div>
                  <dl className="space-y-2 text-xs leading-snug text-zinc-400">
                    <div>
                      <dt className="font-semibold text-zinc-300">Ships from</dt>
                      <dd className="mt-0.5">{shipsCheckout}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-zinc-300">Handling</dt>
                      <dd className="mt-0.5">{listing.handlingEstimate}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-zinc-300">Tracking</dt>
                      <dd className="mt-0.5">{listing.trackingAfterPurchaseLine}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-end gap-3">
                    {selectedRate && !ratesExpanded ? (
                      <button
                        type="button"
                        onClick={() => setRatesExpanded(true)}
                        className="text-xs font-semibold text-gold-bright hover:underline"
                      >
                        Change speed
                      </button>
                    ) : shippingRates.length > 0 && !selectedRate ? (
                      <button
                        type="button"
                        onClick={() => setRatesExpanded(true)}
                        className="text-xs font-semibold text-gold-bright hover:underline"
                      >
                        Choose shipping
                      </button>
                    ) : ratesExpanded ? (
                      <button
                        type="button"
                        onClick={() => setRatesExpanded(false)}
                        className="text-xs font-semibold text-gold-bright hover:underline"
                      >
                        Done
                      </button>
                    ) : null}
                  </div>
                  {ratesLoading ? (
                    <p className="text-sm text-zinc-500">Loading carrier rates for your address…</p>
                  ) : null}
                  {!addressReady && !ratesLoading ? (
                    <p className="text-sm text-zinc-500">Confirm your shipping address to load carrier options.</p>
                  ) : null}
                  {!ratesLoading && ratesError && shippingRates.length === 0 ? (
                    <p className="text-xs font-medium text-rose-300">{ratesError}</p>
                  ) : null}
                  {!showRatePicker && selectedRate ? (
                    <div className="rounded-lg border border-gold/25 bg-gold/[0.06] px-3 py-2.5">
                      <p className="text-sm font-semibold text-zinc-100">
                        {selectedRate.carrier} {selectedRate.serviceLevel}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">{selectedRate.estimatedDelivery}</p>
                      <p className="mt-1.5 font-mono text-sm font-bold text-gold-bright">
                        {formatRatePrice(selectedRate.amount, selectedRate.currency)}
                      </p>
                    </div>
                  ) : null}
                  {showRatePicker && shippingRates.length > 0 ? (
                    <div className="space-y-2">
                      {shippingRates.map((rate) => {
                        const on = selectedRateId === rate.id;
                        return (
                          <button
                            key={rate.id}
                            type="button"
                            onClick={() => selectShippingRate(rate)}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                              on ? "border-gold/45 bg-gold/10" : "border-white/10 bg-[#0c0c10] hover:border-white/20"
                            }`}
                          >
                            <span>
                              <span className="block text-sm font-semibold text-zinc-100">
                                {rate.carrier} {rate.serviceLevel}
                              </span>
                              <span className="mt-0.5 block text-xs text-zinc-500">{rate.estimatedDelivery}</span>
                            </span>
                            <span className="font-mono text-sm font-bold text-gold-bright">
                              {formatRatePrice(rate.amount, rate.currency)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <dl className="mt-3 space-y-2 border-t border-white/[0.06] pt-3 text-xs leading-snug text-zinc-400">
                    <div>
                      <dt className="font-semibold text-zinc-300">Ships from</dt>
                      <dd className="mt-0.5">{shipsCheckout}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-zinc-300">Handling</dt>
                      <dd className="mt-0.5">{listing.handlingEstimate}</dd>
                    </div>
                  </dl>
                </>
              )}
            </CheckoutStep>

            <CheckoutStep step={3} title="Payment">
              {useVaultedSecureCheckout ? (
                <>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    High-value orders use Get Vaulted secure checkout. {PAYMENT_NOTE}
                  </p>
                  <VaultedSecureCheckoutPanel feeCents={secureFeeCents} />
                </>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-zinc-400">{PAYMENT_NOTE}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {["Visa", "Mastercard", "Amex", "Apple Pay"].map((brand) => (
                      <span
                        key={brand}
                        className="rounded-md border border-white/[0.1] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-zinc-400"
                      >
                        {brand}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {useVaultedSecureCheckout ? (
                <p className="mt-2 text-[11px] text-zinc-600">
                  Threshold:{" "}
                  {ESCROW_THRESHOLD_USD.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  })}{" "}
                  item+shipping subtotal.
                </p>
              ) : null}
            </CheckoutStep>

            <CheckoutStep step={4} title="Review & complete">
              <ul className="space-y-2 text-sm text-zinc-400">
                <li className="flex gap-2">
                  <span className="text-gold-bright">✓</span>
                  <span>
                    Ship to{" "}
                    <span className="font-medium text-zinc-200">
                      {addressReady ? `${city}, ${state} ${zip}` : "— add address"}
                    </span>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gold-bright">✓</span>
                  <span>
                    Shipping{" "}
                    <span className="font-medium text-zinc-200">
                      {shippingReady ? formatMoney(shippingPriceUsd) : "— select method"}
                    </span>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gold-bright">✓</span>
                  <span>
                    Total due{" "}
                    <span className="font-mono font-semibold text-gold-bright">
                      {summaryReady ? formatMoney(total) : formatMoney(listing.itemPriceUsd)}
                    </span>
                  </span>
                </li>
              </ul>
              {error ? <p className="mt-3 text-xs font-medium text-rose-300">{error}</p> : null}
              <button
                type="submit"
                disabled={submitting}
                className="mt-4 hidden h-14 w-full items-center justify-center rounded-xl bg-gradient-to-r from-gold to-gold-bright text-base font-bold text-zinc-950 shadow-[0_0_40px_-8px_rgba(201,162,39,0.6)] transition hover:brightness-110 active:scale-[0.995] disabled:opacity-60 lg:inline-flex"
              >
                {completeLabel}
              </button>
            </CheckoutStep>

            <div className="rounded-xl border border-white/[0.06] bg-[#101014]/80 px-4 py-3 lg:hidden">
              <CheckoutTrustStrip />
            </div>
          </div>
        </div>
      </form>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#08080a]/95 backdrop-blur-md supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        role="region"
        aria-label="Checkout actions"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Total</p>
            <p className="truncate font-mono text-lg font-bold text-gold-bright sm:text-xl">
              {summaryReady ? formatMoney(total) : formatMoney(listing.itemPriceUsd)}
            </p>
          </div>
          <button
            type="submit"
            form="buy-now-checkout-form"
            disabled={submitting}
            className="inline-flex h-12 min-w-[160px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-gold to-gold-bright px-5 text-sm font-bold text-zinc-950 shadow-[0_0_32px_-6px_rgba(201,162,39,0.55)] transition hover:brightness-110 active:scale-[0.995] disabled:opacity-60 sm:h-14 sm:min-w-[200px] sm:px-8 sm:text-base"
          >
            {completeLabel}
          </button>
        </div>
      </div>
    </>
  );
}
