"use client";

import { useEffect, useId, useState } from "react";

type AskSellerModalProps = {
  open: boolean;
  onClose: () => void;
  listingTitle: string;
  sellerUsername: string;
  onSubmit: (body: string) => Promise<void>;
};

export function AskSellerModal({ open, onClose, listingTitle, sellerUsername, onSubmit }: AskSellerModalProps) {
  const titleId = useId();
  const [body, setBody] = useState("");
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
      setBody("");
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

  const handleSend = async () => {
    setError(null);
    const t = body.trim();
    if (!t) {
      setError("Write a message before sending.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(t);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
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
          Message seller
        </h2>
        <p className="mt-2 text-sm font-medium text-zinc-400">
          To <span className="text-zinc-200">@{sellerUsername}</span>
        </p>
        <p className="mt-1 text-sm leading-snug text-zinc-300 line-clamp-2">{listingTitle}</p>

        <div className="mt-5 space-y-1.5">
          <label htmlFor="ask-seller-body" className="text-xs font-medium text-zinc-300">
            Message
          </label>
          <textarea
            id="ask-seller-body"
            rows={5}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setError(null);
            }}
            className="min-h-[120px] w-full resize-y rounded-xl border border-white/10 bg-[#0c0c10] px-3.5 py-2.5 text-sm text-foreground outline-none ring-gold/20 placeholder:text-zinc-600 focus:border-gold/40 focus:ring-2"
            placeholder="Ask about condition, shipping, or authenticity…"
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
            onClick={() => void handleSend()}
            className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_0_24px_-6px_rgba(201,162,39,0.45)] transition hover:brightness-110 disabled:opacity-60 sm:min-w-[10rem]"
          >
            Send message
          </button>
        </div>
      </div>
    </div>
  );
}
