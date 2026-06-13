"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LiveShippingIndicator } from "@/components/live-auction/LiveShippingIndicator";
import { VaultedSecureCheckoutPanel } from "@/components/checkout/VaultedSecureCheckoutPanel";
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

export function BuyNowCheckoutForm({
  listing,
  liveRoomItemId = null,
  returnLiveRoomId = null,
}: {
  listing: CheckoutListingSnapshot;
  liveRoomItemId?: string | null;
  /** When set (e.g. live buy-now return), show bundled live shipping snapshot for this show. */
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

  const taxLineLabel = (() => {
    if (!summaryReady) return "—";
    if (taxLoading) return "Calculating…";
    if (taxCollect && taxUsd > 0) return formatMoney(taxUsd);
    if (taxCollect && taxNote) return taxNote;
    if (taxCollect) return "$0.00";
    if (taxNote) return taxNote;
    return "Not applicable";
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

  const orderSummaryPanel = (
    <div className="rounded-2xl border border-white/[0.08] bg-[#08080a]/90 p-5 sm:p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Order summary</p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Item price</dt>
          <dd className="font-mono font-semibold text-zinc-200">{formatMoney(listing.itemPriceUsd)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Shipping</dt>
          <dd className="font-mono font-semibold text-zinc-200">
            {!shippingReady && !usesFlatShipping && !liveRoomItemId
              ? "Select option"
              : ratesLoading && !usesFlatShipping
                ? "Calculating…"
                : formatMoney(shippingPriceUsd)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Sales tax</dt>
          <dd className="max-w-[58%] text-right font-mono font-semibold text-zinc-200">{taxLineLabel}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-white/[0.06] pt-3">
          <dt className="font-semibold text-zinc-300">Total</dt>
          <dd className="font-mono text-base font-bold text-gold-bright">
            {summaryReady ? formatMoney(total) : formatMoney(listing.itemPriceUsd)}
          </dd>
        </div>
        {!summaryReady ? (
          <p className="text-[10px] leading-snug text-zinc-500">
            Choose your address and shipping option to see your full total.
          </p>
        ) : taxCollect ? (
          <p className="text-[10px] leading-snug text-zinc-500">
            Sales tax is buyer-paid and is not included in seller payout or platform fees.
          </p>
        ) : null}
      </dl>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-12">
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Item</p>
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#08080a]">
          <div className="aspect-square w-full max-w-[280px] bg-[#0b0b0e]">
            {listing.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-zinc-600">No image</div>
            )}
          </div>
          <div className="border-t border-white/[0.06] p-4">
            <p className="font-medium leading-snug text-zinc-100">{listing.title}</p>
            <p className="mt-2 font-mono text-lg font-bold text-gold-bright">{formatMoney(listing.itemPriceUsd)}</p>
          </div>
        </div>
        <div className="hidden lg:block">{orderSummaryPanel}</div>
      </div>

      <div className="min-w-0 space-y-6">
        {returnLiveRoomId ? (
          <LiveShippingIndicator liveShowId={returnLiveRoomId} pollMs={0} className="border border-zinc-800 bg-[#08080a]/90" />
        ) : null}

        {!hasSavedAddress ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-950/10 p-5 sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/85">Wallet setup</p>
            <p className="mt-2 text-sm leading-snug text-zinc-400">
              Save a shipping address once in your Wallet — it applies to live shows and every purchase.
            </p>
            <Link
              href="/account/payment-methods#wallet-shipping"
              className="mt-4 inline-flex text-sm font-semibold text-gold-bright hover:underline"
            >
              Add shipping address in Wallet →
            </Link>
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/[0.08] bg-[#08080a]/90 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Shipping address</p>
            {hasSavedAddress && !addressExpanded ? (
              <button
                type="button"
                onClick={() => setAddressExpanded(true)}
                className="text-xs font-semibold text-gold-bright hover:underline"
              >
                Change
              </button>
            ) : addressExpanded ? (
              <button
                type="button"
                onClick={() => setAddressExpanded(false)}
                className="text-xs font-semibold text-gold-bright hover:underline"
              >
                Done
              </button>
            ) : null}
          </div>
          {hasSavedAddress && !addressExpanded && preferredAddress ? (
            <p className="mt-3 rounded-xl border border-white/10 bg-[#0c0c10] px-4 py-3 text-sm leading-snug text-zinc-300">
              {addressSummary}
            </p>
          ) : (
            <>
          {savedAddresses.length > 0 ? (
            <label className="mt-4 block">
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
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
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
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-zinc-400">Full name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-zinc-400">Street address</span>
              <input
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-zinc-400">City</span>
              <input
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-zinc-400">State / Province</span>
              <input
                required
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-zinc-400">ZIP / Postal code</span>
              <input
                required
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-zinc-400">Country</span>
              <input
                required
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
              />
            </label>
          </div>
            </>
          )}
        </div>

        {!usesFlatShipping && !liveRoomItemId ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#08080a]/90 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Shipping</p>
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
              <p className="mt-3 text-sm text-zinc-500">Loading carrier rates for your address…</p>
            ) : null}
            {!addressReady && !ratesLoading ? (
              <p className="mt-3 text-sm text-zinc-500">Confirm your shipping address to load carrier options.</p>
            ) : null}
            {!ratesLoading && ratesError && shippingRates.length === 0 ? (
              <p className="mt-3 text-xs font-medium text-rose-300">{ratesError}</p>
            ) : null}
            {!showRatePicker && selectedRate ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-[#0c0c10] px-4 py-3">
                <p className="text-sm font-semibold text-zinc-100">
                  {selectedRate.carrier} {selectedRate.serviceLevel}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">{selectedRate.estimatedDelivery}</p>
                <p className="mt-2 font-mono text-sm font-bold text-gold-bright">
                  {formatRatePrice(selectedRate.amount, selectedRate.currency)}
                </p>
              </div>
            ) : null}
            {showRatePicker && shippingRates.length > 0 ? (
              <div className="mt-3 space-y-2">
                {shippingRates.map((rate) => {
                  const on = selectedRateId === rate.id;
                  return (
                    <button
                      key={rate.id}
                      type="button"
                      onClick={() => selectShippingRate(rate)}
                      className={`flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition ${
                        on ? "border-gold/50 bg-gold/10" : "border-white/10 bg-[#0c0c10] hover:border-white/20"
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
          </div>
        ) : null}

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200/85">Delivery</p>
          <dl className="mt-3 space-y-2.5 text-xs leading-snug text-zinc-400">
            <div>
              <dt className="font-semibold text-zinc-200">Ships from</dt>
              <dd className="mt-0.5">{shipsCheckout}</dd>
            </div>
            <div>
              <dt className="font-semibold text-zinc-200">Handling</dt>
              <dd className="mt-0.5">{listing.handlingEstimate}</dd>
            </div>
            <div>
              <dt className="font-semibold text-zinc-200">Tracking</dt>
              <dd className="mt-0.5">{listing.trackingAfterPurchaseLine}</dd>
            </div>
          </dl>
        </div>

        {useVaultedSecureCheckout ? <VaultedSecureCheckoutPanel feeCents={secureFeeCents} /> : null}

        <div className="lg:hidden">{orderSummaryPanel}</div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#08080a]/90 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Payment</p>
          {useVaultedSecureCheckout ? (
            <p className="mt-2 text-sm text-zinc-500">
              You will continue to our <span className="font-medium text-zinc-300">secure checkout</span> partner to
              fund the transaction. Your order is confirmed when the processor confirms funds — not from the return page
              alone.
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">
              You will be redirected to <span className="font-medium text-zinc-300">Stripe Checkout</span> (test mode
              when using test API keys). Your order is confirmed only after Stripe sends a successful webhook — not from
              the return page alone.
            </p>
          )}
          <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-3 text-sm text-zinc-400">
            {useVaultedSecureCheckout ? "High-value secure checkout (over $5,000)" : "Visa / Mastercard / Amex via Stripe"}
          </div>
          {useVaultedSecureCheckout ? (
            <p className="mt-2 text-[11px] text-zinc-600">
              Threshold: {ESCROW_THRESHOLD_USD.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}{" "}
              item+shipping subtotal.
            </p>
          ) : null}
          {error ? <p className="mt-3 text-xs font-medium text-rose-300">{error}</p> : null}
          <button
            type="submit"
            disabled={submitting}
            className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 shadow-[0_0_32px_-6px_rgba(201,162,39,0.55)] transition hover:brightness-110 disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
          >
            {submitting ? "Processing…" : useVaultedSecureCheckout ? VAULTED_SECURE_CHECKOUT.cta : "Complete purchase"}
          </button>
        </div>
      </div>
    </form>
  );
}
