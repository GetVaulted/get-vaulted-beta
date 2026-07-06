"use client";

import { useEffect, useId, useState } from "react";

export type OfferAskingLine = { label: string; value: string };

type MarketplaceMakeOfferModalProps = {
  open: boolean;
  onClose: () => void;
  listingTitle: string;
  askingLines: OfferAskingLine[];
  minimumOfferUsd?: number;
  onSubmit: (amountUsd: number, message: string) => void | Promise<void>;
};

/** Strict money format: digits, optional decimal point, at most 2 decimal places. No sign, no letters. */
const OFFER_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Rejects (returns null for) any raw input containing a minus sign, letters, or more than
 * 2 decimal places — rather than stripping invalid characters and silently reinterpreting
 * bad input (e.g. "-100" or "abc123") as a valid positive amount.
 */
export function parseOfferAmount(raw: string): number | null {
  const trimmed = String(raw).trim();
  if (!OFFER_AMOUNT_PATTERN.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function MarketplaceMakeOfferModal({
  open,
  onClose,
  listingTitle,
  askingLines,
  minimumOfferUsd,
  onSubmit,
}: MarketplaceMakeOfferModalProps) {
  const titleId = useId();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setAmount("");
      setMessage("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async () => {
    setError(null);
    const trimmed = amount.trim();
    if (trimmed === "") {
      setError("Enter a valid offer amount.");
      return;
    }
    const n = parseOfferAmount(trimmed);
    if (n == null) {
      setError("Enter a valid offer amount using digits only, with at most two decimal places (e.g. 45.00).");
      return;
    }
    if (n <= 0) {
      setError("Offer must be greater than zero.");
      return;
    }
    if (minimumOfferUsd != null && Number.isFinite(minimumOfferUsd) && n < minimumOfferUsd) {
      setError(`Offers must be at least ${minimumOfferUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(n, message.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
        className="relative z-[1] w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0a0a0d] p-5 shadow-[0_24px_64px_-20px_rgba(0,0,0,0.9)] sm:p-6"
      >
        <h2 id={titleId} className="font-display text-lg font-bold text-foreground">
          Make an offer
        </h2>
        <p className="mt-2 text-sm font-medium leading-snug text-zinc-200">{listingTitle}</p>
        <div className="mt-4 space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3">
          {askingLines.map((line) => (
            <div key={line.label} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-zinc-500">{line.label}</span>
              <span className="font-mono font-semibold tabular-nums text-gold-bright">{line.value}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-1.5">
          <label htmlFor="offer-amount" className="text-xs font-medium text-zinc-300">
            Offer amount (USD)
          </label>
          <input
            id="offer-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            className="h-11 w-full rounded-xl border border-white/10 bg-[#0c0c10] px-3.5 text-sm text-foreground outline-none ring-gold/20 placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2"
            placeholder="0.00"
            autoComplete="off"
          />
        </div>

        <div className="mt-4 space-y-1.5">
          <label htmlFor="offer-message" className="text-xs font-medium text-zinc-300">
            Message <span className="font-normal text-zinc-600">(optional)</span>
          </label>
          <textarea
            id="offer-message"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[88px] w-full resize-y rounded-xl border border-white/10 bg-[#0c0c10] px-3.5 py-2.5 text-sm text-foreground outline-none ring-gold/20 placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2"
            placeholder="Introduce yourself or add context for the seller."
          />
        </div>

        {error ? <p className="mt-3 text-xs font-medium text-rose-300">{error}</p> : null}

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-full border border-white/[0.14] px-6 text-sm font-semibold text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.04] sm:min-w-[7rem]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_0_24px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110 disabled:opacity-60 sm:min-w-[10rem]"
          >
            {submitting ? "Sending…" : "Submit Offer"}
          </button>
        </div>
      </div>
    </div>
  );
}
