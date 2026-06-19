"use client";

import type { LiveItemVariantDTO, LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { isVariantSalesFormat, variantBuyerSelectLabel } from "@/lib/live-item-variant-presets";

type LiveVariantSpotBoardProps = {
  item: LiveRoomItemDTO | null;
  pinned?: boolean;
  hostMode?: boolean;
  onToggleHot?: (variantId: string, isHot: boolean) => void;
  minimized?: boolean;
  onToggleMinimized?: () => void;
  onAddSupplemental?: () => void;
  hostBusy?: boolean;
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** Host / stage spot list — compact pills matching mobile buyer checkout picker. */
export function LiveVariantSpotBoard({
  item,
  hostMode = false,
  onToggleHot,
  minimized = false,
  onToggleMinimized,
  onAddSupplemental,
  hostBusy = false,
}: LiveVariantSpotBoardProps) {
  if (!item || !isVariantSalesFormat(item.salesFormat) || !item.variants?.length) return null;

  const variants = [...item.variants].sort((a, b) => a.sortOrder - b.sortOrder);
  const available = variants.filter((v) => v.quantityRemaining > 0 && v.status !== "sold_out").length;
  const boardLabel = variantBuyerSelectLabel(item.salesFormat);

  if (hostMode && minimized) {
    return (
      <div className="pointer-events-auto flex max-w-lg items-center gap-2 rounded-full border border-white/10 bg-zinc-950/90 py-1.5 pl-3 pr-1.5 shadow-lg backdrop-blur-xl">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold text-zinc-200">{item.title}</p>
          <p className="text-[9px] font-semibold text-emerald-300/90">
            {available} open · {variants.length} spots
          </p>
        </div>
        {onAddSupplemental ? (
          <button
            type="button"
            disabled={hostBusy}
            onClick={onAddSupplemental}
            className="shrink-0 rounded-full border border-amber-300/30 bg-amber-500/15 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-amber-100 disabled:opacity-40"
          >
            + Supp
          </button>
        ) : null}
        {onToggleMinimized ? (
          <button
            type="button"
            onClick={onToggleMinimized}
            className="shrink-0 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-200"
          >
            Expand
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pointer-events-auto w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950/92 p-3 shadow-xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200/80">{boardLabel}</p>
          <p className="mt-0.5 truncate text-xs font-bold text-white">{item.title}</p>
          <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">
            {available} open · {variants.length - available} sold
          </p>
        </div>
        {hostMode ? (
          <div className="flex shrink-0 items-center gap-1">
            {onAddSupplemental ? (
              <button
                type="button"
                disabled={hostBusy}
                onClick={onAddSupplemental}
                className="rounded-lg border border-amber-300/35 bg-amber-500/15 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-amber-100 disabled:opacity-40"
              >
                Add Supp.
              </button>
            ) : null}
            {onToggleMinimized ? (
              <button
                type="button"
                onClick={onToggleMinimized}
                className="rounded-lg border border-white/12 bg-black/40 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-zinc-400 hover:text-zinc-200"
              >
                −
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex max-h-[min(36vh,280px)] flex-wrap gap-2 overflow-y-auto pr-0.5">
        {variants.map((v) => {
          const sold = v.quantityRemaining <= 0 || v.status === "sold_out";
          return (
            <div
              key={v.id}
              className={`relative min-w-[5.5rem] max-w-[48%] flex-grow rounded-full border px-3 py-2 ${
                sold
                  ? "border-dashed border-white/15 bg-white/[0.015] opacity-70"
                  : v.isHot
                    ? "border-amber-400/40 bg-amber-500/10"
                    : "border-white/15 bg-white/[0.03]"
              }`}
            >
              {v.isHot && !sold ? (
                <span className="absolute -top-1.5 right-2 rounded-full border border-white/20 bg-red-600 px-1.5 py-0.5 text-[8px] font-black uppercase text-white">
                  Hot
                </span>
              ) : null}
              <div className="flex items-start justify-between gap-1">
                <p className={`text-xs font-bold ${sold ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{v.label}</p>
                {hostMode && onToggleHot ? (
                  <button
                    type="button"
                    onClick={() => onToggleHot(v.id, !v.isHot)}
                    className="text-[9px] text-zinc-500 hover:text-amber-300"
                    aria-label={`Toggle hot for ${v.label}`}
                  >
                    ★
                  </button>
                ) : null}
              </div>
              <p className={`mt-0.5 font-mono text-[10px] font-bold ${sold ? "text-zinc-600" : "text-zinc-500"}`}>
                {sold ? "Sold" : fmtMoney(v.priceUsd)}
                {!sold && v.buyerUsername ? ` · @${v.buyerUsername}` : ""}
              </p>
              {sold && v.buyerUsername ? (
                <p className="mt-0.5 truncate text-[9px] font-semibold text-emerald-300/80">@{v.buyerUsername}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
