"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { WATCHLIST_TOAST_EVENT } from "@/lib/watchlist-events";

type Props = {
  listingId: string;
  /** Tighter layout for tables / sales rows */
  compact?: boolean;
  onDone?: () => void;
};

type ModalKind = "draft" | "active" | "next" | "cancel";

type NextPreview = {
  backupBidderUsername: string;
  hammerPriceUsd: number;
  paymentWindowMinutes: number;
};

function emitToast(message: string) {
  window.dispatchEvent(new CustomEvent(WATCHLIST_TOAST_EVENT, { detail: { message } }));
}

export function ExpiredAuctionRecoveryPanel({ listingId, compact, onDone }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [preview, setPreview] = useState<NextPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const finish = useCallback(() => {
    onDone?.();
    router.refresh();
  }, [onDone, router]);

  const base = `/api/listings/${encodeURIComponent(listingId)}`;

  const post = useCallback(async (path: string, body?: Record<string, unknown>) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : "{}",
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Request failed.");
      return false;
    }
    return true;
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
  }, []);

  useEffect(() => {
    if (modal !== "next") return;
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    void (async () => {
      try {
        const res = await fetch(`${base}/offer-next-bidder/preview`);
        const data = (await res.json().catch(() => ({}))) as NextPreview & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setPreviewError(data.error ?? "Could not load next bidder preview.");
          setPreview(null);
          return;
        }
        setPreview({
          backupBidderUsername: data.backupBidderUsername,
          hammerPriceUsd: data.hammerPriceUsd,
          paymentWindowMinutes: data.paymentWindowMinutes,
        });
      } catch {
        if (!cancelled) setPreviewError("Could not load next bidder preview.");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modal, base]);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, busy, closeModal]);

  const runAction = async (key: string, path: string, body: Record<string, unknown> | undefined, successToast: string) => {
    setError(null);
    setBusy(key);
    try {
      const ok = await post(path, body);
      if (ok) {
        closeModal();
        emitToast(successToast);
        finish();
      }
    } finally {
      setBusy(null);
    }
  };

  const pending = busy !== null;

  const openDraft = () => {
    setError(null);
    setModal("draft");
  };
  const openActive = () => {
    setError(null);
    setModal("active");
  };
  const openNext = () => {
    setError(null);
    setModal("next");
  };
  const openCancel = () => {
    setError(null);
    setModal("cancel");
  };

  const hammerFmt =
    preview != null
      ? preview.hammerPriceUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
      : "";

  return (
    <div
      className={
        compact
          ? "rounded-xl border border-rose-500/20 bg-rose-950/15 px-3 py-3"
          : "rounded-2xl border border-rose-500/25 bg-rose-950/20 p-5"
      }
    >
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200/90">Winner payment expired</p>
      <p className="mt-1 text-xs text-zinc-400">Choose how to move forward — your listing is not sold.</p>
      {error ? <p className="mt-2 text-xs font-medium text-rose-300">{error}</p> : null}
      <div className={`mt-3 flex flex-wrap gap-2 ${compact ? "" : "gap-2.5"}`}>
        <button
          type="button"
          disabled={pending}
          onClick={openDraft}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.05] px-3 text-xs font-semibold text-zinc-200 transition hover:border-gold/35 hover:text-gold-bright disabled:opacity-50"
        >
          Relist item — edit first
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={openActive}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:opacity-50"
        >
          Relist item — go live now
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={openNext}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:opacity-50"
        >
          Offer to next bidder
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={openCancel}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-600 bg-zinc-900/60 px-3 text-xs font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
        >
          Cancel auction result
        </button>
      </div>

      {modal && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 sm:items-center"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !pending) closeModal();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#0c0c10] p-5 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)]"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200/80">Confirm recovery</p>
                {modal === "draft" ? (
                  <>
                    <h2 className="mt-2 font-display text-lg font-bold text-foreground">Relist item — edit first</h2>
                    <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-zinc-300">
                      <li>The expired winner checkout is removed; the sale is not completed.</li>
                      <li>This listing moves to <strong className="text-zinc-100">draft</strong> so you can change photos, description, reserve, or duration.</li>
                      <li>Republish from My listings when you are ready.</li>
                    </ul>
                  </>
                ) : null}
                {modal === "active" ? (
                  <>
                    <h2 className="mt-2 font-display text-lg font-bold text-foreground">Relist item — go live now</h2>
                    <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-zinc-300">
                      <li>The expired winner checkout is removed; the sale is not completed.</li>
                      <li>
                        The listing goes <strong className="text-zinc-100">live immediately</strong> (buy now as active, or a
                        new auction timer for auctions).
                      </li>
                      <li>
                        <strong className="text-zinc-100">Stripe Connect</strong> must be ready; otherwise live publish will
                        be blocked.
                      </li>
                    </ul>
                  </>
                ) : null}
                {modal === "next" ? (
                  <>
                    <h2 className="mt-2 font-display text-lg font-bold text-foreground">Offer to next bidder</h2>
                    {previewLoading ? (
                      <p className="mt-3 text-sm text-zinc-400">Loading next bidder…</p>
                    ) : previewError ? (
                      <p className="mt-3 text-sm text-rose-300">{previewError}</p>
                    ) : preview ? (
                      <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-950/20 p-3 text-sm text-zinc-200">
                        <p>
                          <span className="text-zinc-500">Next bidder</span>{" "}
                          <span className="font-semibold text-amber-100">@{preview.backupBidderUsername}</span>
                        </p>
                        <p className="mt-1">
                          <span className="text-zinc-500">New hammer price</span>{" "}
                          <span className="font-mono font-semibold text-gold-bright">{hammerFmt}</span>{" "}
                          <span className="text-zinc-500">(+ shipping at checkout)</span>
                        </p>
                        <p className="mt-1">
                          <span className="text-zinc-500">Payment window</span>{" "}
                          <span className="font-semibold text-zinc-100">{preview.paymentWindowMinutes} minutes</span>
                        </p>
                      </div>
                    ) : null}
                    {!previewLoading && !previewError && preview ? (
                      <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-zinc-300">
                        <li>The unpaid winner order is deleted; they can no longer pay for this auction.</li>
                        <li>
                          A new order is created for <strong className="text-zinc-100">@{preview.backupBidderUsername}</strong>{" "}
                          at <strong className="text-zinc-100">{hammerFmt}</strong> with a fresh deadline.
                        </li>
                        <li>They are notified to pay within {preview.paymentWindowMinutes} minutes.</li>
                      </ul>
                    ) : null}
                  </>
                ) : null}
                {modal === "cancel" ? (
                  <>
                    <h2 className="mt-2 font-display text-lg font-bold text-foreground">Cancel auction result</h2>
                    <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-zinc-300">
                      <li>The expired unpaid checkout is removed.</li>
                      <li>
                        The listing returns to <strong className="text-zinc-100">draft</strong>; no automatic offer to other
                        bidders.
                      </li>
                      <li>Use this when you want a clean slate without going live or offering to the next bidder from here.</li>
                    </ul>
                  </>
                ) : null}

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={closeModal}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-white/15 px-4 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.04] disabled:opacity-50"
                  >
                    Back
                  </button>
                  {modal === "draft" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        void runAction("draft", `${base}/relist`, { targetStatus: "draft" }, "Listing saved as draft.")
                      }
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-r from-gold to-gold-bright px-4 text-xs font-bold text-zinc-950 disabled:opacity-50"
                    >
                      {busy === "draft" ? "Working…" : "Confirm — move to draft"}
                    </button>
                  ) : null}
                  {modal === "active" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        void runAction("active", `${base}/relist`, { targetStatus: "active" }, "Listing is live again.")
                      }
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-500/90 px-4 text-xs font-bold text-emerald-950 disabled:opacity-50"
                    >
                      {busy === "active" ? "Working…" : "Confirm — go live now"}
                    </button>
                  ) : null}
                  {modal === "next" ? (
                    <button
                      type="button"
                      disabled={pending || previewLoading || !preview || !!previewError}
                      onClick={() =>
                        void runAction(
                          "next",
                          `${base}/offer-next-bidder`,
                          undefined,
                          "Offer sent to the next bidder. They have 30 minutes to pay.",
                        )
                      }
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-500/90 px-4 text-xs font-bold text-amber-950 disabled:opacity-50"
                    >
                      {busy === "next" ? "Working…" : "Confirm — offer to next bidder"}
                    </button>
                  ) : null}
                  {modal === "cancel" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        void runAction(
                          "cancel",
                          `${base}/cancel-auction-result`,
                          undefined,
                          "Auction result cancelled. Listing is in draft.",
                        )
                      }
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-500 bg-zinc-800 px-4 text-xs font-semibold text-zinc-100 disabled:opacity-50"
                    >
                      {busy === "cancel" ? "Working…" : "Confirm — cancel result"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
