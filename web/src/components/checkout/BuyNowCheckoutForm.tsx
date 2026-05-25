"use client";

import { useEffect, useMemo, useState } from "react";
import { LiveShippingIndicator } from "@/components/live-auction/LiveShippingIndicator";
import { VaultedSecureCheckoutPanel } from "@/components/checkout/VaultedSecureCheckoutPanel";
import { ESCROW_THRESHOLD_USD, estimateEscrowFeeCents, orderTotalQualifiesForEscrow } from "@/lib/escrow-config";
import { VAULTED_SECURE_CHECKOUT } from "@/lib/vaulted-secure-checkout-copy";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/account/addresses", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as { addresses?: Array<{ id: string; type?: string; isDefault?: boolean; fullName: string; line1: string; line2: string | null; city: string; state: string; postalCode: string; country: string }> };
      const rows = Array.isArray(j.addresses) ? j.addresses.filter((a) => a.type === "shipping") : [];
      if (cancelled) return;
      setSavedAddresses(rows);
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
    if (!address.trim() || !city.trim() || !state.trim() || !zip.trim()) {
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
              shippingPriceUsd: listing.shippingPriceUsd,
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
            setTaxNote(j.error ?? "Tax calculated at checkout.");
          }
        } finally {
          setTaxLoading(false);
        }
      })();
    }, 400);
    return () => window.clearTimeout(t);
  }, [address, city, state, zip, country, name, listing.itemPriceUsd, listing.shippingPriceUsd]);

  const subtotal = useMemo(
    () => listing.itemPriceUsd + listing.shippingPriceUsd,
    [listing.itemPriceUsd, listing.shippingPriceUsd],
  );

  const total = useMemo(() => subtotal + taxUsd, [subtotal, taxUsd]);

  const useVaultedSecureCheckout = orderTotalQualifiesForEscrow(subtotal);
  const secureFeeCents = useMemo(() => estimateEscrowFeeCents(subtotal), [subtotal]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
          },
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

  return (
    <form onSubmit={onSubmit} className="grid gap-10 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-12">
      <div className="space-y-4">
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
      </div>

      <div className="min-w-0 space-y-8">
        {returnLiveRoomId ? (
          <LiveShippingIndicator liveShowId={returnLiveRoomId} pollMs={0} className="border border-zinc-800 bg-[#08080a]/90" />
        ) : null}
        <div className="rounded-2xl border border-white/[0.08] bg-[#08080a]/90 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Order details</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Item price</dt>
              <dd className="font-mono font-semibold text-zinc-200">{formatMoney(listing.itemPriceUsd)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Shipping</dt>
              <dd className="font-mono font-semibold text-zinc-200">{formatMoney(listing.shippingPriceUsd)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Sales tax</dt>
              <dd className="font-mono font-semibold text-zinc-200">
                {taxLoading ? "Calculating…" : taxCollect ? formatMoney(taxUsd) : taxNote ?? "Calculated at checkout"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-white/[0.06] pt-3">
              <dt className="font-semibold text-zinc-300">Total</dt>
              <dd className="font-mono text-base font-bold text-gold-bright">{formatMoney(total)}</dd>
            </div>
            {taxCollect ? (
              <p className="text-[10px] leading-snug text-zinc-500">
                Sales tax is buyer-paid via Stripe Tax and is not included in seller payout or platform fees.
              </p>
            ) : null}
          </dl>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200/85">Shipping and delivery</p>
          <dl className="mt-3 space-y-2.5 text-xs leading-snug text-zinc-400">
            <div>
              <dt className="font-semibold text-zinc-200">Estimated shipping</dt>
              <dd className="mt-0.5">{formatMoney(listing.shippingPriceUsd)} (included in total above)</dd>
            </div>
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

        <div className="rounded-2xl border border-white/[0.08] bg-[#08080a]/90 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Shipping address</p>
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
        </div>

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
