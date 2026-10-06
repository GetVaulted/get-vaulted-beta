"use client";

import { useEffect, useState } from "react";
import { REVIEW_BODY_MAX, SELLER_REVIEW_QUICK_TAGS } from "@/lib/seller-reviews";

type ReviewState =
  | { kind: "loading" }
  | { kind: "blocked"; message: string | null }
  | { kind: "form" }
  | { kind: "done"; rating: number; body: string };

type ReviewResponse = {
  canReview?: boolean;
  reason?: string | null;
  message?: string | null;
  review?: { rating: number; body: string } | null;
};

/** Buyer-only "Review the seller" box on an order. Appears only once the order is delivered. */
export function OrderReviewPanel({ orderId, sellerUsername }: { orderId: string; sellerUsername: string }) {
  const [state, setState] = useState<ReviewState>({ kind: "loading" });
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/account/orders/${encodeURIComponent(orderId)}/review`, { cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as ReviewResponse;
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "blocked", message: null });
        } else if (j.review) {
          setState({ kind: "done", rating: j.review.rating, body: j.review.body });
        } else if (j.canReview) {
          setState({ kind: "form" });
        } else {
          setState({ kind: "blocked", message: j.reason === "not_delivered" ? j.message ?? null : null });
        }
      } catch {
        if (!cancelled) setState({ kind: "blocked", message: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const submit = async () => {
    if (rating < 1) {
      setError("Choose a star rating first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/orders/${encodeURIComponent(orderId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, body, tags }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
      if (res.ok || j.reason === "already_reviewed") {
        setState({ kind: "done", rating, body: body.trim() });
      } else {
        setError(j.error ?? "Could not post your review. Try again.");
      }
    } catch {
      setError("Could not post your review. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === "loading") return null;
  if (state.kind === "blocked") {
    return state.message ? (
      <p className="mt-8 text-xs text-zinc-500">{state.message}</p>
    ) : null;
  }

  return (
    <section className="mt-8 rounded-2xl border border-white/[0.08] bg-[#0a0a0d] p-6" aria-label="Review the seller">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Review @{sellerUsername}</p>
      {state.kind === "done" ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-zinc-100">
            <span className="text-gold-bright" aria-label={`${state.rating} out of 5 stars`}>
              {"★".repeat(state.rating)}
              <span className="text-zinc-700">{"★".repeat(5 - state.rating)}</span>
            </span>{" "}
            Thanks, your review is on their profile.
          </p>
          {state.body ? <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">{state.body}</p> : null}
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <div role="radiogroup" aria-label="Star rating" className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                onClick={() => setRating(n)}
                className={`size-10 rounded-lg text-2xl leading-none transition ${
                  n <= rating ? "text-gold-bright" : "text-zinc-700 hover:text-zinc-500"
                }`}
              >
                ★
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {SELLER_REVIEW_QUICK_TAGS.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTags((prev) => (on ? prev.filter((x) => x !== t) : [...prev, t].slice(0, 5)))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "border-gold/45 bg-gold/12 text-gold-bright"
                      : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <label className="block" htmlFor={`review-body-${orderId}`}>
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">How did it go? (optional)</span>
            <textarea
              id={`review-body-${orderId}`}
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, REVIEW_BODY_MAX))}
              rows={3}
              className="mt-1 w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold/35"
              placeholder="Packaging, shipping, communication…"
            />
          </label>
          {error ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-100">{error}</p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="inline-flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Posting…" : "Post review"}
          </button>
          <p className="text-[11px] text-zinc-600">Reviews are public and can&apos;t be edited after you post.</p>
        </div>
      )}
    </section>
  );
}
