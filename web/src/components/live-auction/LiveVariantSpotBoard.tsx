"use client";

import type { LiveItemVariantDTO, LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";

type LiveVariantSpotBoardProps = {
  item: LiveRoomItemDTO | null;
  pinned?: boolean;
  hostMode?: boolean;
  onToggleHot?: (variantId: string, isHot: boolean) => void;
  /** Host console: collapse to compact pill (session-persisted by parent). */
  minimized?: boolean;
  onToggleMinimized?: () => void;
  onAddSupplemental?: () => void;
  hostBusy?: boolean;
};

function cellLabel(v: LiveItemVariantDTO) {
  if (v.quantityRemaining <= 0 || v.status === "sold_out") {
    return v.buyerUsername ? `@${v.buyerUsername}` : "SOLD";
  }
  return "Available";
}

/** Spot / division board for variant live items. */
export function LiveVariantSpotBoard({
  item,
  pinned = true,
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

  if (hostMode && minimized) {
    return (
      <div className="pointer-events-auto flex max-w-lg items-center gap-2 rounded-full border border-white/10 bg-zinc-950/90 py-1.5 pl-3 pr-1.5 shadow-lg backdrop-blur-xl">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold text-zinc-200">{item.title}</p>
          <p className="text-[9px] font-semibold text-emerald-300/90">{available} open · {variants.length} spots</p>
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
            aria-label="Expand spot board"
          >
            Expand
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-auto w-full max-w-lg rounded-2xl border border-white/[0.08] bg-black/55 p-3 backdrop-blur-xl ${
        pinned ? "shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Spot board</p>
          <p className="mt-0.5 truncate text-xs font-bold text-zinc-200">{item.title}</p>
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
                aria-label="Minimize spot board"
              >
                −
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {variants.map((v) => {
          const sold = v.quantityRemaining <= 0 || v.status === "sold_out";
          return (
            <div
              key={v.id}
              className={`rounded-xl border px-2 py-2 transition ${
                sold
                  ? "border-emerald-500/20 bg-emerald-950/25"
                  : v.isHot
                    ? "border-amber-400/25 bg-amber-500/10"
                    : "border-white/[0.06] bg-white/[0.03]"
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <p className="text-[10px] font-bold leading-snug text-zinc-100">
                  {v.label}
                  {v.isHot ? " 🔥" : ""}
                </p>
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
              <p className={`mt-1 truncate text-[9px] font-semibold ${sold ? "text-emerald-300/90" : "text-zinc-500"}`}>
                {cellLabel(v)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
