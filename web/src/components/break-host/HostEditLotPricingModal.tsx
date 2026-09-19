"use client";

import { useEffect, useState } from "react";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";

export type LotSaleType = "auction" | "buy_now";

export type LotPricingDraft = {
  saleType: LotSaleType;
  price: string;
  quantity: string;
};

export type LotPricingValues = {
  saleType: LotSaleType;
  quantity: number;
  startingBidUsd: number | null;
  priceUsd: number | null;
};

function fmtInput(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function parseUsd(raw: string): number | null {
  const cleaned = raw.trim().replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseQuantity(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Math.floor(Number(raw.trim()));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, 512);
}

export function lotPricingDraftFromItem(item: LiveRoomItemDTO): LotPricingDraft {
  const saleType: LotSaleType = item.salesFormat === "buy_now" ? "buy_now" : "auction";
  const price = saleType === "buy_now" ? fmtInput(item.priceUsd) : fmtInput(item.startingBidUsd ?? 1);
  const qty = item.remainingQuantity > 0 ? item.remainingQuantity : item.quantityInitial > 0 ? item.quantityInitial : 1;
  return { saleType, price, quantity: String(qty) };
}

export function validateLotPricingDraft(
  draft: LotPricingDraft,
): { ok: true; values: LotPricingValues } | { ok: false; message: string } {
  const quantity = draft.quantity.trim() ? parseQuantity(draft.quantity) : 1;
  if (quantity == null) {
    return { ok: false, message: "Quantity must be at least 1." };
  }
  const priceUsd = parseUsd(draft.price);
  if (draft.saleType === "auction") {
    const startingBidUsd = priceUsd ?? 1;
    if (startingBidUsd < 1) {
      return { ok: false, message: "Starting bid must be at least $1." };
    }
    return { ok: true, values: { saleType: "auction", quantity, startingBidUsd, priceUsd: null } };
  }
  if (priceUsd == null) {
    return { ok: false, message: "Enter a buy-it-now price." };
  }
  return { ok: true, values: { saleType: "buy_now", quantity, startingBidUsd: null, priceUsd } };
}

/** Currently-editable plain (non-variant) lot: not locked by an open auction or a completed sale. */
export function lotPricingEditableItem(item: LiveRoomItemDTO | null | undefined): LiveRoomItemDTO | null {
  if (!item) return null;
  if (isVariantSalesFormat(item.salesFormat)) return null;
  if (item.biddingOpen || item.status === "sold") return null;
  return item;
}

type Props = {
  open: boolean;
  item: LiveRoomItemDTO | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (itemId: string, values: LotPricingValues, previousSaleType: LotSaleType) => void;
};

export function HostEditLotPricingModal({ open, item, busy = false, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<LotPricingDraft>({ saleType: "auction", price: "", quantity: "1" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && item) {
      setDraft(lotPricingDraftFromItem(item));
      setError(null);
    }
  }, [open, item?.id]);

  if (!open || !item) return null;

  const locked = item.biddingOpen || item.status === "sold";
  const priceLabel = draft.saleType === "auction" ? "Starting bid" : "Buy-it-now price";
  const previousSaleType: LotSaleType = item.salesFormat === "buy_now" ? "buy_now" : "auction";

  const save = () => {
    const validated = validateLotPricingDraft(draft);
    if (!validated.ok) {
      setError(validated.message);
      return;
    }
    setError(null);
    onSave(item.id, validated.values, previousSaleType);
  };

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Edit lot pricing"
      className="fixed inset-x-0 bottom-0 top-[var(--site-header-offset)] z-[72] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92dvh,640px)] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-amber-400/25 bg-[#0c0b10] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200/90">Edit lot</p>
            <h2 className="mt-0.5 truncate text-base font-black text-white">{item.displayTitle || item.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-white/12 px-2.5 py-1 text-sm text-zinc-400 hover:bg-white/[0.06]"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {locked ? (
            <p className="text-sm leading-relaxed text-rose-300">
              Bidding has started — pricing can no longer be changed.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Change sale type before bidding starts — switch Buy It Now to Auction to run a timed bid.
              </p>

              <div>
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  Sale type
                </span>
                <div className="flex gap-2">
                  {(["auction", "buy_now"] as const).map((type) => {
                    const active = draft.saleType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        disabled={busy}
                        onClick={() => setDraft((d) => ({ ...d, saleType: type }))}
                        className={`flex-1 rounded-lg border py-2.5 text-sm font-bold transition disabled:opacity-50 ${
                          active
                            ? "border-amber-400/45 bg-amber-500/15 text-amber-100"
                            : "border-white/12 bg-white/[0.04] text-zinc-400 hover:bg-white/[0.07]"
                        }`}
                      >
                        {type === "auction" ? "Auction" : "Buy It Now"}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                  {draft.saleType === "auction"
                    ? "Buyers bid until the timer ends."
                    : "Fixed price — buyers purchase instantly when the lot is pinned."}
                </p>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  {priceLabel}
                </span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                    $
                  </span>
                  <input
                    inputMode="decimal"
                    disabled={busy}
                    value={draft.price}
                    onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                    placeholder={draft.saleType === "auction" ? "1" : "25"}
                    className="w-full rounded-lg border border-amber-400/25 bg-black/35 py-2.5 pl-7 pr-3 text-sm font-semibold text-zinc-100 outline-none focus:border-amber-400/50 disabled:opacity-50"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  Quantity
                </span>
                <input
                  inputMode="numeric"
                  disabled={busy}
                  value={draft.quantity}
                  onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
                  placeholder="1"
                  className="w-full rounded-lg border border-amber-400/25 bg-black/35 py-2.5 px-3 text-sm font-semibold text-zinc-100 outline-none focus:border-amber-400/50 disabled:opacity-50"
                />
              </label>

              {error ? <p className="text-[12px] font-semibold text-rose-300">{error}</p> : null}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-white/[0.08] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {!locked ? (
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="min-h-11 flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-sm font-black uppercase tracking-wide text-zinc-950 disabled:opacity-45"
            >
              {busy ? "Saving…" : "Save pricing"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 flex-1 rounded-xl border border-white/15 text-sm font-bold text-zinc-300"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
