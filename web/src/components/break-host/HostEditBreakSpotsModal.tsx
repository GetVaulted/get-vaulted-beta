"use client";

import { useEffect, useMemo, useState } from "react";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { isVariantSalesFormat, variantBuyerSelectLabel } from "@/lib/live-item-variant-presets";
import { formatSoldSpotBuyerLabel } from "@/lib/live-variant-spot-board";

type SpotDraft = {
  id: string;
  label: string;
  priceUsd: number;
  isHot: boolean;
  sold: boolean;
  buyerUsername: string | null;
};

function parseUsd(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function variantsToDrafts(item: LiveRoomItemDTO): SpotDraft[] {
  return [...(item.variants ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((v) => ({
      id: v.id,
      label: v.label,
      priceUsd: v.priceUsd,
      isHot: v.isHot,
      sold: v.quantityRemaining <= 0 || v.status === "sold_out",
      buyerUsername: v.buyerUsername?.trim()?.replace(/^@+/, "") ?? null,
    }));
}

type Props = {
  open: boolean;
  item: LiveRoomItemDTO | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (itemId: string, updates: Array<{ id: string; priceUsd?: number; isHot?: boolean }>) => void;
};

export function HostEditBreakSpotsModal({ open, item, busy = false, onClose, onSave }: Props) {
  const [spots, setSpots] = useState<SpotDraft[]>([]);
  const [basePrice, setBasePrice] = useState("");

  useEffect(() => {
    if (!open || !item) {
      setSpots([]);
      setBasePrice("");
      return;
    }
    setSpots(variantsToDrafts(item));
    setBasePrice("");
  }, [
    item?.id,
    open,
    // Refresh sold/open state when host marks spots sold while the editor can reopen.
    item?.variants
      ?.map((v) => `${v.id}:${v.quantityRemaining}:${v.status}:${v.priceUsd}:${v.isHot ? 1 : 0}`)
      .join("|"),
  ]);

  const boardLabel = item ? variantBuyerSelectLabel(item.salesFormat) : "Teams";
  const openCount = spots.filter((s) => !s.sold).length;
  const locked = item?.status === "sold";

  const applyBaseToOpen = () => {
    const parsed = parseUsd(basePrice);
    if (parsed == null) return;
    setSpots((prev) => prev.map((s) => (s.sold ? s : { ...s, priceUsd: parsed })));
    setBasePrice("");
  };

  const toggleHot = (id: string) => {
    setSpots((prev) => prev.map((s) => (s.id === id && !s.sold ? { ...s, isHot: !s.isHot } : s)));
  };

  const setSpotPrice = (id: string, raw: string) => {
    const parsed = parseUsd(raw);
    if (parsed == null) return;
    setSpots((prev) => prev.map((s) => (s.id === id && !s.sold ? { ...s, priceUsd: parsed } : s)));
  };

  const save = () => {
    if (!item) return;
    const updates = spots
      .filter((s) => s.id && !s.sold)
      .map((s) => ({ id: s.id, priceUsd: s.priceUsd, isHot: s.isHot }));
    if (updates.length === 0) return;
    onSave(item.id, updates);
  };

  if (!open || !item || !isVariantSalesFormat(item.salesFormat)) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Edit team spots"
      className="fixed inset-0 z-[72] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-amber-400/25 bg-[#0c0b10] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200/90">{boardLabel}</p>
            <h2 className="mt-0.5 truncate text-base font-black text-white">{item.displayTitle || item.title}</h2>
            <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
              {openCount} open · tap a team to adjust price · ★ pins featured
            </p>
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
          {!locked ? (
            <div className="mb-3 flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  Set all open spots
                </span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                    $
                  </span>
                  <input
                    inputMode="decimal"
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-white/12 bg-black/40 py-2 pl-6 pr-2 text-sm font-semibold text-zinc-100 outline-none focus:border-amber-400/40"
                  />
                </div>
              </label>
              <button
                type="button"
                disabled={busy || !basePrice.trim()}
                onClick={applyBaseToOpen}
                className="shrink-0 rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-200 disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          ) : (
            <p className="mb-3 text-sm text-rose-300">This break is sold — spot pricing is locked.</p>
          )}

          <div className="flex flex-wrap gap-2">
            {spots.map((spot) => (
              <SpotEditorPill
                key={spot.id}
                spot={spot}
                disabled={busy || locked}
                onToggleHot={() => toggleHot(spot.id)}
                onPriceBlur={(raw) => setSpotPrice(spot.id, raw)}
              />
            ))}
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-white/[0.08] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {!locked ? (
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="min-h-11 flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-sm font-black uppercase tracking-wide text-zinc-950 disabled:opacity-45"
            >
              {busy ? "Saving…" : "Save spots"}
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

function SpotEditorPill({
  spot,
  disabled,
  onToggleHot,
  onPriceBlur,
}: {
  spot: SpotDraft;
  disabled?: boolean;
  onToggleHot: () => void;
  onPriceBlur: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? fmtUsd(spot.priceUsd);

  useEffect(() => {
    setDraft(null);
  }, [spot.priceUsd]);

  return (
    <div
      className={`relative min-w-[7rem] max-w-[48%] flex-grow rounded-2xl border px-2.5 py-2 ${
        spot.sold
          ? "border-dashed border-white/15 bg-white/[0.02] opacity-70"
          : spot.isHot
            ? "border-amber-400/45 bg-amber-500/10"
            : "border-white/15 bg-white/[0.03]"
      }`}
    >
      {!spot.sold ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onToggleHot}
          className={`absolute -top-1.5 right-1.5 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase ${
            spot.isHot ? "bg-red-600 text-white" : "bg-black/50 text-zinc-500 hover:text-amber-300"
          }`}
          aria-label={`${spot.isHot ? "Unpin" : "Pin"} ${spot.label}`}
        >
          {spot.isHot ? "Hot" : "★"}
        </button>
      ) : null}
      <p className={`truncate text-xs font-bold ${spot.sold ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
        {spot.label}
      </p>
      {spot.sold ? (
        <p className="mt-1 truncate text-[10px] font-semibold text-emerald-300/80">
          {formatSoldSpotBuyerLabel(spot.buyerUsername)}
        </p>
      ) : (
        <div className="relative mt-1">
          <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">
            $
          </span>
          <input
            inputMode="decimal"
            disabled={disabled}
            value={display}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft != null) onPriceBlur(draft);
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="w-full rounded-md border border-white/10 bg-black/35 py-1 pl-4 pr-1 text-[11px] font-bold tabular-nums text-amber-200 outline-none focus:border-amber-400/40 disabled:opacity-50"
          />
        </div>
      )}
    </div>
  );
}

export function variantItemForSpotEditor(args: {
  activeBoardRow: { item: LiveRoomItemDTO } | null;
  previewQueueRow?: { item: LiveRoomItemDTO } | null;
}): LiveRoomItemDTO | null {
  const active = args.activeBoardRow?.item;
  if (active && isVariantSalesFormat(active.salesFormat)) return active;
  const preview = args.previewQueueRow?.item;
  if (
    preview &&
    isVariantSalesFormat(preview.salesFormat) &&
    preview.status !== "sold" &&
    preview.status !== "skipped"
  ) {
    return preview;
  }
  return null;
}
