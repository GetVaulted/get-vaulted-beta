"use client";

import { useEffect, useMemo, useState } from "react";
import type { CheckoutListingSnapshot } from "@/components/checkout/BuyNowCheckoutForm";
import { LAYAWAY_TERMS_COPY } from "@/lib/layaway/constants";
import { layawayDepositUsd, layawayRemainingBalanceUsd } from "@/lib/layaway/math";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

type PlanType = "thirty_day" | "sixty_day";

export function LayawayCheckoutForm({ listing }: { listing: CheckoutListingSnapshot }) {
  const [planType, setPlanType] = useState<PlanType>("thirty_day");
  const [termsAcknowledged, setTermsAcknowledged] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("US");
  const [buyerAddressId, setBuyerAddressId] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<
    Array<{ id: string; fullName: string; line1: string; line2: string | null; city: string; state: string; postalCode: string; country: string }>
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyerBlocked, setBuyerBlocked] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/account/layaway-status", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as { hasActiveLayaway?: boolean };
      if (j.hasActiveLayaway) {
        setBuyerBlocked("You already have an active layaway. Complete or default it before starting another.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/account/addresses", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as {
        addresses?: Array<{ id: string; type?: string; isDefault?: boolean; fullName: string; line1: string; line2: string | null; city: string; state: string; postalCode: string; country: string }>;
      };
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
        setCountry(preferred.country ?? "US");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const depositUsd = useMemo(() => layawayDepositUsd(listing.itemPriceUsd), [listing.itemPriceUsd]);
  const remainingUsd = useMemo(
    () => layawayRemainingBalanceUsd({ itemPriceUsd: listing.itemPriceUsd, shippingPriceUsd: listing.shippingPriceUsd }),
    [listing.itemPriceUsd, listing.shippingPriceUsd],
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (buyerBlocked) {
      setError(buyerBlocked);
      return;
    }
    if (!termsAcknowledged) {
      setError("Acknowledge layaway terms to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "layaway_deposit",
          listingId: listing.id,
          planType,
          termsAcknowledged: true,
          shipping: {
            buyerAddressId: buyerAddressId || undefined,
            shipRecipientName: name,
            shipAddress: address,
            shipCity: city,
            shipState: state,
            shipZip: zip,
            shipCountry: country,
          },
          successPath: "/account/layaways",
          cancelPath: `/checkout/${encodeURIComponent(listing.id)}?mode=layaway`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) {
        setError(data.error ?? "Layaway checkout failed.");
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
        {buyerBlocked ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/90">{buyerBlocked}</p>
        ) : null}

        <div className="rounded-2xl border border-white/[0.08] bg-[#08080a]/90 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Layaway plan</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className={`cursor-pointer rounded-xl border p-4 transition ${planType === "thirty_day" ? "border-gold/50 bg-gold/10" : "border-white/10 bg-white/[0.02] hover:border-white/18"}`}>
              <input type="radio" name="plan" value="thirty_day" checked={planType === "thirty_day"} onChange={() => setPlanType("thirty_day")} className="sr-only" />
              <p className="text-sm font-bold text-zinc-100">30-Day Plan</p>
              <p className="mt-1 text-xs text-zinc-500">Pay remaining balance within 30 days</p>
            </label>
            <label className={`cursor-pointer rounded-xl border p-4 transition ${planType === "sixty_day" ? "border-gold/50 bg-gold/10" : "border-white/10 bg-white/[0.02] hover:border-white/18"}`}>
              <input type="radio" name="plan" value="sixty_day" checked={planType === "sixty_day"} onChange={() => setPlanType("sixty_day")} className="sr-only" />
              <p className="text-sm font-bold text-zinc-100">60-Day Plan</p>
              <p className="mt-1 text-xs text-zinc-500">Pay remaining balance within 60 days</p>
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#08080a]/90 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Due today (deposit)</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">25% non-refundable deposit</dt>
              <dd className="font-mono font-semibold text-gold-bright">{formatMoney(depositUsd)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Remaining balance (incl. shipping)</dt>
              <dd className="font-mono font-semibold text-zinc-300">{formatMoney(remainingUsd)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-snug text-zinc-500">Shipping ({formatMoney(listing.shippingPriceUsd)}) is collected with balance payments. Item ships only after paid in full.</p>
        </div>

        <div className="rounded-2xl border border-amber-500/25 bg-amber-950/10 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/80">Layaway terms</p>
          <ul className="mt-3 space-y-2 text-xs leading-snug text-zinc-400">
            {LAYAWAY_TERMS_COPY.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-400/80" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <label className="mt-4 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={termsAcknowledged}
              onChange={(e) => setTermsAcknowledged(e.target.checked)}
              className="mt-0.5 size-4 rounded border-white/20 bg-[#0c0c10] accent-gold"
            />
            <span className="text-sm text-zinc-300">I acknowledge the layaway terms and understand the deposit is non-refundable.</span>
          </label>
        </div>

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
                  setCountry(selected.country ?? "US");
                }}
                className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
              >
                <option value="">Use manual entry</option>
                {savedAddresses.map((addr) => (
                  <option key={addr.id} value={addr.id}>
                    {addr.fullName} — {addr.city}, {addr.state}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-zinc-400">Full name</span>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm outline-none focus:border-gold/40" />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-zinc-400">Street address</span>
              <input required value={address} onChange={(e) => setAddress(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm outline-none focus:border-gold/40" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-zinc-400">City</span>
              <input required value={city} onChange={(e) => setCity(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm outline-none focus:border-gold/40" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-zinc-400">State</span>
              <input required value={state} onChange={(e) => setState(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm outline-none focus:border-gold/40" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-zinc-400">ZIP</span>
              <input required value={zip} onChange={(e) => setZip(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm outline-none focus:border-gold/40" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-zinc-400">Country</span>
              <input required value={country} onChange={(e) => setCountry(e.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3 text-sm outline-none focus:border-gold/40" />
            </label>
          </div>
        </div>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting || Boolean(buyerBlocked)}
          className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-8px_rgba(201,162,39,0.5)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
        >
          {submitting ? "Starting checkout…" : `Pay ${formatMoney(depositUsd)} deposit`}
        </button>
      </div>
    </form>
  );
}
