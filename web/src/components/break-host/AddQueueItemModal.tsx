"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LiveItemVariantBuilder, type LiveItemSalesFormatDraft } from "@/components/live-auction/LiveItemVariantBuilder";
import { compressImageFileToBlob } from "@/lib/listing-image-compress";
import { isVariantSalesFormat, type VariantDraftInput } from "@/lib/live-item-variant-presets";
import { uploadListingImageBlob } from "@/lib/upload-listing-image-client";

export type AddQueueItemCloseReason = "cancel" | "success" | "escape";

export type AddQueueItemAuctionPayload = {
  title: string;
  imageUrl: string;
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
const THUMBNAIL_UPLOAD_ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const THUMBNAIL_MAX_FILE_BYTES = 20 * 1024 * 1024;

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
  const [auctionDraftImageUrl, setAuctionDraftImageUrl] = useState("");
  const [auctionDraftImageUploading, setAuctionDraftImageUploading] = useState(false);
  const [auctionDraftImageError, setAuctionDraftImageError] = useState<string | null>(null);
  const [auctionDraftPrice, setAuctionDraftPrice] = useState("");
  const [auctionDraftQuantity, setAuctionDraftQuantity] = useState("1");
  const [auctionDraftStartBid, setAuctionDraftStartBid] = useState("");
  const [auctionDraftSalesFormat, setAuctionDraftSalesFormat] = useState<LiveItemSalesFormatDraft>("auction");
  const [auctionDraftVariants, setAuctionDraftVariants] = useState<VariantDraftInput[]>([]);
  const [queueDraftMisc, setQueueDraftMisc] = useState(false);
  const builderSessionRef = useRef(0);
  const wasOpenRef = useRef(false);
  const imageFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      builderSessionRef.current += 1;
      setAuctionDraftTitle("");
      setAuctionDraftImageUrl("");
      setAuctionDraftImageUploading(false);
      setAuctionDraftImageError(null);
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

  const uploadQueueThumbnail = useCallback(async (file: File) => {
    setAuctionDraftImageError(null);
    if (!THUMBNAIL_UPLOAD_ALLOWED.has(file.type)) {
      setAuctionDraftImageError("Use a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > THUMBNAIL_MAX_FILE_BYTES) {
      setAuctionDraftImageError("Thumbnail image must be 20MB or smaller.");
      return;
    }

    setAuctionDraftImageUploading(true);
    try {
      const blob = await compressImageFileToBlob(file, 1280, 0.86);
      const url = await uploadListingImageBlob(blob, "live-queue-thumbnail.jpg");
      setAuctionDraftImageUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setAuctionDraftImageError(msg || "Could not upload thumbnail image.");
    } finally {
      setAuctionDraftImageUploading(false);
    }
  }, []);

  const handleSubmitAuction = useCallback(async () => {
    const title = auctionDraftTitle.trim();
    if (!title) return;
    if (!auctionDraftImageUrl.trim()) {
      setAuctionDraftImageError("Upload 1 thumbnail image.");
      return;
    }
    const p = auctionDraftPrice.trim() === "" ? null : Number(auctionDraftPrice);
    const qtyRaw = auctionDraftQuantity.trim() === "" ? 1 : Number(auctionDraftQuantity);
    const quantity = Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.min(512, Math.floor(qtyRaw)) : 1;
    const sbRaw = auctionDraftStartBid.trim();
    const startingBidUsd =
      sbRaw === "" ? 1 : Number.isFinite(Number(sbRaw)) && Number(sbRaw) > 0 ? Number(sbRaw) : 1;
    const ok = await onSubmitAuction({
      title,
      imageUrl: auctionDraftImageUrl.trim(),
      priceUsd: p != null && Number.isFinite(p) ? p : null,
      startingBidUsd,
      quantity: isVariantSalesFormat(auctionDraftSalesFormat) ? 1 : quantity,
      salesFormat: auctionDraftSalesFormat,
      variants: auctionDraftVariants,
      teamBoardMisc: queueDraftMisc,
    });
    if (ok) requestClose("success", onRequestClose);
  }, [
    auctionDraftImageUrl,
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
              <div className="mt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Thumbnail</span>
                <div
                  onClick={() => !auctionDraftImageUrl && imageFileRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !auctionDraftImageUrl) {
                      e.preventDefault();
                      imageFileRef.current?.click();
                    }
                  }}
                  className={`mt-2 rounded-lg border border-dashed px-4 py-4 transition ${
                    auctionDraftImageUrl
                      ? "border-white/10 bg-[#0c0c10]"
                      : "cursor-pointer border-white/15 bg-[#0c0c10] hover:border-white/25"
                  } ${auctionDraftImageUploading ? "pointer-events-none opacity-70" : ""}`}
                >
                  <input
                    ref={imageFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void uploadQueueThumbnail(f);
                    }}
                  />
                  {auctionDraftImageUrl.trim() ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- uploaded queue thumbnail */}
                      <img src={auctionDraftImageUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-zinc-200">Thumbnail uploaded</p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">Shown on auction cards, queue, and pinned item.</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          imageFileRef.current?.click();
                        }}
                        className="rounded-lg border border-white/12 px-2 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-white/[0.06]"
                      >
                        Replace
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-2 text-center">
                      <p className="text-sm font-semibold text-zinc-200">Upload thumbnail</p>
                      <p className="mt-1 text-[11px] text-zinc-500">Upload 1 thumbnail image · JPG, PNG, or WebP</p>
                    </div>
                  )}
                </div>
                {auctionDraftImageError ? (
                  <p className="mt-1 text-xs text-rose-300">{auctionDraftImageError}</p>
                ) : null}
              </div>
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
