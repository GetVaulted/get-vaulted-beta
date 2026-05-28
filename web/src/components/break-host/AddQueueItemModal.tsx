"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LiveItemVariantBuilder, type LiveItemSalesFormatDraft } from "@/components/live-auction/LiveItemVariantBuilder";
import { isVariantSalesFormat, type VariantDraftInput } from "@/lib/live-item-variant-presets";

export type AddQueueItemCloseReason = "cancel" | "success" | "escape";

export type AddQueueItemAuctionPayload = {
  title: string;
  priceUsd: number | null;
  startingBidUsd: number;
  quantity: number;
  salesFormat: LiveItemSalesFormatDraft;
  variants: VariantDraftInput[];
  teamBoardMisc: boolean;
};

type Props = {
  open: boolean;
  mode: "auction" | "bin" | "givvy" | null;
  teamBoardLeague?: string | null;
  busy?: boolean;
  onRequestClose: (reason: AddQueueItemCloseReason) => void;
  onSubmitAuction: (payload: AddQueueItemAuctionPayload) => Promise<boolean>;
};

const ALLOWED_CLOSE: AddQueueItemCloseReason[] = ["cancel", "success", "escape"];

function requestClose(reason: string, onRequestClose: (reason: AddQueueItemCloseReason) => void) {
  const allowed = ALLOWED_CLOSE.includes(reason as AddQueueItemCloseReason);
  console.log("[add queue modal] close reason", reason, allowed ? "(allowed)" : "(blocked)");
  if (!allowed) return;
  onRequestClose(reason as AddQueueItemCloseReason);
}

export function AddQueueItemModal({
  open,
  mode,
  teamBoardLeague,
  busy = false,
  onRequestClose,
  onSubmitAuction,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [auctionDraftTitle, setAuctionDraftTitle] = useState("");
  const [auctionDraftPrice, setAuctionDraftPrice] = useState("");
  const [auctionDraftQuantity, setAuctionDraftQuantity] = useState("1");
  const [auctionDraftStartBid, setAuctionDraftStartBid] = useState("");
  const [auctionDraftSalesFormat, setAuctionDraftSalesFormat] = useState<LiveItemSalesFormatDraft>("auction");
  const [auctionDraftVariants, setAuctionDraftVariants] = useState<VariantDraftInput[]>([]);
  const [queueDraftMisc, setQueueDraftMisc] = useState(false);
  const builderSessionRef = useRef(0);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      builderSessionRef.current += 1;
      setAuctionDraftTitle("");
      setAuctionDraftPrice("");
      setAuctionDraftQuantity("1");
      setAuctionDraftStartBid("");
      setAuctionDraftSalesFormat("auction");
      setAuctionDraftVariants([]);
      setQueueDraftMisc(false);
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose("escape", onRequestClose);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onRequestClose]);

  const handleSubmitAuction = useCallback(async () => {
    const title = auctionDraftTitle.trim();
    if (!title) return;
    const p = auctionDraftPrice.trim() === "" ? null : Number(auctionDraftPrice);
    const qtyRaw = auctionDraftQuantity.trim() === "" ? 1 : Number(auctionDraftQuantity);
    const quantity = Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.min(512, Math.floor(qtyRaw)) : 1;
    const sbRaw = auctionDraftStartBid.trim();
    const startingBidUsd =
      sbRaw === "" ? 1 : Number.isFinite(Number(sbRaw)) && Number(sbRaw) > 0 ? Number(sbRaw) : 1;
    const ok = await onSubmitAuction({
      title,
      priceUsd: p != null && Number.isFinite(p) ? p : null,
      startingBidUsd,
      quantity: isVariantSalesFormat(auctionDraftSalesFormat) ? 1 : quantity,
      salesFormat: auctionDraftSalesFormat,
      variants: auctionDraftVariants,
      teamBoardMisc: queueDraftMisc,
    });
    if (ok) requestClose("success", onRequestClose);
  }, [
    auctionDraftPrice,
    auctionDraftQuantity,
    auctionDraftSalesFormat,
    auctionDraftStartBid,
    auctionDraftTitle,
    auctionDraftVariants,
    onRequestClose,
    onSubmitAuction,
    queueDraftMisc,
  ]);

  if (!mounted || !open || !mode) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label="Add queue item"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose("backdrop", onRequestClose);
      }}
    >
      <div
        className="flex max-h-[min(92dvh,calc(100vh-48px))] w-full max-w-[min(840px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100">
            {mode === "auction" ? "Add queue item" : mode === "bin" ? "Add BIN item" : "Add Givvy"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => requestClose("cancel", onRequestClose)}
            className="rounded-lg border border-white/12 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06]"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-5">
          {mode === "auction" ? (
            <>
              <input
                value={auctionDraftTitle}
                onChange={(e) => setAuctionDraftTitle(e.target.value)}
                placeholder="Title"
                className="w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100"
              />
              <input
                value={auctionDraftPrice}
                onChange={(e) => setAuctionDraftPrice(e.target.value)}
                placeholder="Price USD (optional)"
                className="mt-2 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100"
              />
              <div className="mt-3 min-w-0">
                <LiveItemVariantBuilder
                  key={`variant-builder-${builderSessionRef.current}`}
                  salesFormat={auctionDraftSalesFormat}
                  onSalesFormatChange={setAuctionDraftSalesFormat}
                  defaultPriceUsd={auctionDraftPrice}
                  variants={auctionDraftVariants}
                  onVariantsChange={setAuctionDraftVariants}
                />
              </div>
              {!isVariantSalesFormat(auctionDraftSalesFormat) ? (
                <>
                  <input
                    value={auctionDraftStartBid}
                    onChange={(e) => setAuctionDraftStartBid(e.target.value)}
                    placeholder="Starting bid USD (default 1.00)"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100"
                  />
                  <label className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    Quantity
                  </label>
                  <input
                    inputMode="numeric"
                    min={1}
                    value={auctionDraftQuantity}
                    onChange={(e) => setAuctionDraftQuantity(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="1"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#0c0c10] px-3 py-2 text-sm text-zinc-100"
                    aria-label="Quantity"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Quantity creates numbered units, like PYT Break 1 #1, #2, #3.
                  </p>
                </>
              ) : null}
              {teamBoardLeague === "nfl" ? (
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={queueDraftMisc}
                    onChange={(e) => setQueueDraftMisc(e.target.checked)}
                    className="rounded border-white/20 bg-[#0c0c10]"
                  />
                  MISC spot (shows MISC on team board while this item is active)
                </label>
              ) : null}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => requestClose("cancel", onRequestClose)}
                  className="flex-1 rounded-lg border border-white/12 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSubmitAuction()}
                  className="flex-1 rounded-lg bg-gold/25 py-2 text-sm font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/30 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </>
          ) : mode === "bin" ? (
            <>
              <p className="text-sm leading-relaxed text-zinc-500">
                BIN queue is not wired to the API yet. Use the auction queue for live lots for now.
              </p>
              <button
                type="button"
                onClick={() => requestClose("cancel", onRequestClose)}
                className="mt-4 w-full rounded-lg bg-gold/25 py-2.5 text-sm font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/30"
              >
                Close
              </button>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-zinc-500">
                Giveaway queue is not wired yet. This tab will connect to your givvy flow when the API is ready.
              </p>
              <button
                type="button"
                onClick={() => requestClose("cancel", onRequestClose)}
                className="mt-4 w-full rounded-lg bg-gold/25 py-2.5 text-sm font-bold text-gold-bright ring-1 ring-gold/35 hover:bg-gold/30"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
