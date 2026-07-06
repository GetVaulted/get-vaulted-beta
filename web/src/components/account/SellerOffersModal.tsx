"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { offerStatusLabel, offerStatusTone } from "@/lib/offer-status";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Strict money format: digits, optional decimal point, at most 2 decimal places. No sign, no letters. */
const COUNTER_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Rejects (returns null for) any raw input containing a minus sign, letters, or more than
 * 2 decimal places — rather than stripping invalid characters and silently reinterpreting
 * bad input as a valid positive amount.
 */
export function parseCounterAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!COUNTER_AMOUNT_PATTERN.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export type ListingOfferRow = {
  id: string;
  buyerUsername: string;
  amountUsd: number;
  message: string | null;
  status: string;
  counterAmountUsd: number | null;
  createdAt: string;
};

type SellerOffersModalProps = {
  open: boolean;
  onClose: () => void;
  listingId: string | null;
  listingTitle: string;
  onChanged?: () => void;
  /** Offer id to scroll to and visually highlight, e.g. when arriving from a notification deep-link. */
  highlightOfferId?: string | null;
};

export function SellerOffersModal({
  open,
  onClose,
  listingId,
  listingTitle,
  onChanged,
  highlightOfferId,
}: SellerOffersModalProps) {
  const titleId = useId();
  const [offers, setOffers] = useState<ListingOfferRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [counterDrafts, setCounterDrafts] = useState<Record<string, string>>({});
  const [counteringId, setCounteringId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!listingId) return;
    setLoadError(null);
    setOffers(null);
    const res = await fetch(`/api/listings/${encodeURIComponent(listingId)}/offers`);
    if (!res.ok) {
      setLoadError("Could not load offers.");
      setOffers([]);
      return;
    }
    const data = (await res.json()) as { offers?: ListingOfferRow[] };
    setOffers(Array.isArray(data.offers) ? data.offers : []);
  }, [listingId]);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && listingId) void load();
  }, [open, listingId, load]);

  useEffect(() => {
    if (!open) {
      setOffers(null);
      setLoadError(null);
      setBusyId(null);
      setCounterDrafts({});
      setCounteringId(null);
      setActionError(null);
      setCreatedOrderId(null);
    }
  }, [open]);

  const patch = async (offerId: string, body: Record<string, unknown>) => {
      setActionError(null);
      setCreatedOrderId(null);
      setBusyId(offerId);
      try {
        const res = await fetch(`/api/offers/${encodeURIComponent(offerId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; orderId?: string };
        if (!res.ok) {
          setActionError(typeof data.error === "string" ? data.error : "Action failed.");
          return;
        }
        if (typeof data.orderId === "string") setCreatedOrderId(data.orderId);
        await load();
        onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center" role="presentation">
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] max-h-[min(85vh,640px)] w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0a0a0d] shadow-[0_24px_64px_-20px_rgba(0,0,0,0.9)]"
      >
        <div className="border-b border-white/[0.08] px-5 py-4">
          <h2 id={titleId} className="font-display text-lg font-bold text-foreground">
            Offers
          </h2>
          <p className="mt-1 text-sm text-zinc-500 line-clamp-2">{listingTitle}</p>
        </div>
        <div className="max-h-[min(52vh,420px)] overflow-y-auto px-3 py-3 sm:px-5">
          {createdOrderId ? (
            <div className="mb-3 rounded-lg border border-emerald-400/25 bg-emerald-950/25 px-3 py-2 text-xs text-emerald-100/95">
              Sale recorded.{" "}
              <Link href={`/orders/${encodeURIComponent(createdOrderId)}`} className="font-semibold text-gold-bright hover:underline">
                View order
              </Link>
            </div>
          ) : null}
          {loadError ? <p className="py-6 text-center text-sm text-rose-300">{loadError}</p> : null}
          {offers === null && !loadError ? (
            <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
          ) : offers && offers.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No offers on this listing yet.</p>
          ) : offers && offers.length > 0 ? (
            <ul className="space-y-2.5">
              {actionError ? <p className="rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">{actionError}</p> : null}
              {offers.map((o) => {
                const busy = busyId === o.id;
                const pending = o.status === "pending";
                const countered = o.status === "countered";
                const highlighted = highlightOfferId === o.id;
                return (
                  <li
                    key={o.id}
                    ref={
                      highlighted
                        ? (el) => {
                            el?.scrollIntoView({ block: "nearest" });
                          }
                        : undefined
                    }
                    className={`rounded-xl border px-3 py-2.5 sm:px-3.5 ${
                      highlighted ? "border-gold/45 bg-gold/[0.06] ring-1 ring-gold/30" : "border-white/[0.08] bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-200">@{o.buyerUsername}</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${offerStatusTone(o.status)}`}>
                        {offerStatusLabel(o.status)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[10px] text-zinc-600">Offer</span>
                      <span className="font-mono text-sm font-bold text-gold-bright">{formatMoney(o.amountUsd)}</span>
                    </div>
                    {countered && o.counterAmountUsd != null ? (
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Your counter: <span className="font-mono font-semibold text-amber-200/95">{formatMoney(o.counterAmountUsd)}</span>{" "}
                        <span className="text-zinc-600">· awaiting buyer</span>
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      {new Date(o.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    {o.message ? <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">{o.message}</p> : null}

                    {pending ? (
                      <div className="mt-2.5 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patch(o.id, { action: "accept" })}
                            className="rounded-lg border border-emerald-400/35 bg-emerald-950/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-950/40 disabled:opacity-50"
                          >
                            {busy ? "Working…" : "Accept"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patch(o.id, { action: "decline" })}
                            className="rounded-lg border border-white/[0.12] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 transition hover:border-white/20 disabled:opacity-50"
                          >
                            {busy ? "Working…" : "Decline"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setCounteringId((id) => (id === o.id ? null : o.id))}
                            className="rounded-lg border border-amber-400/35 bg-amber-950/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100/90 transition hover:bg-amber-950/35 disabled:opacity-50"
                          >
                            Counter
                          </button>
                        </div>
                        {counteringId === o.id ? (
                          <div className="flex flex-wrap items-end gap-2 border-t border-white/[0.06] pt-2">
                            <label className="min-w-[8rem] flex-1">
                              <span className="text-[10px] font-medium text-zinc-500">Counter (USD)</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={counterDrafts[o.id] ?? ""}
                                onChange={(e) => setCounterDrafts((d) => ({ ...d, [o.id]: e.target.value }))}
                                className="mt-0.5 h-9 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-2.5 text-sm text-foreground outline-none focus:border-gold/35"
                                placeholder="0"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                const raw = (counterDrafts[o.id] ?? "").trim();
                                const n = parseCounterAmount(raw);
                                if (n == null) {
                                  setActionError(
                                    "Enter a valid counter amount using digits only, with at most two decimal places (e.g. 45.00).",
                                  );
                                  return;
                                }
                                if (!(n > 0)) {
                                  setActionError("Counter amount must be greater than zero.");
                                  return;
                                }
                                void patch(o.id, { action: "counter", counterAmountUsd: n }).then(() => {
                                  setCounteringId(null);
                                  setCounterDrafts((d) => {
                                    const next = { ...d };
                                    delete next[o.id];
                                    return next;
                                  });
                                });
                              }}
                              className="h-9 rounded-lg bg-gradient-to-r from-gold to-gold-bright px-3 text-xs font-bold text-zinc-950 disabled:opacity-50"
                            >
                              {busy ? "Sending…" : "Send counter"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {countered ? (
                      <p className="mt-2 text-[10px] text-zinc-600">Buyer can accept or decline your counter from their account.</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <div className="border-t border-white/[0.08] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-full items-center justify-center rounded-full border border-white/[0.12] text-sm font-semibold text-zinc-300 transition hover:border-gold/35 hover:bg-white/[0.04]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
