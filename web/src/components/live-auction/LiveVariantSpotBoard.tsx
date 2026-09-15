"use client";

import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { isVariantSalesFormat, variantBuyerSelectLabel, hostSpotBoardPinEnabled } from "@/lib/live-item-variant-presets";
import { buildVariantSpotDisplayRows, formatSoldSpotBuyerLabel, formatUnavailableSpotLabel } from "@/lib/live-variant-spot-board";

type LiveVariantSpotBoardProps = {
  item: LiveRoomItemDTO | null;
  pinned?: boolean;
  hostMode?: boolean;
  /** Buyer @username — sold tiles they own get a Yours highlight. */
  highlightUsername?: string | null;
  onToggleHot?: (variantId: string, isHot: boolean) => void;
  /** Host taps an open spot to pin it for buyers (exclusive). */
  onPinVariant?: (variantId: string) => void;
  pinBusy?: boolean;
  minimized?: boolean;
  onToggleMinimized?: () => void;
  onAddSupplemental?: () => void;
  hostBusy?: boolean;
  onEditSpots?: () => void;
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** Host / stage spot list — compact pills matching mobile buyer checkout picker. */
export function LiveVariantSpotBoard({
  item,
  hostMode = false,
  highlightUsername = null,
  onToggleHot,
  onPinVariant,
  pinBusy = false,
  minimized = false,
  onToggleMinimized,
  onAddSupplemental,
  hostBusy = false,
  onEditSpots,
}: LiveVariantSpotBoardProps) {
  if (!item || !isVariantSalesFormat(item.salesFormat) || !item.variants?.length) return null;

  const rows = buildVariantSpotDisplayRows(item, item.randomSpotClaims ?? []);
  const available = rows.filter((r) => !r.sold && !r.unavailable).length;
  const unavailableCount = rows.filter((r) => r.unavailable).length;
  const soldCount = rows.filter((r) => r.sold).length;
  const breakRoster =
    available <= 0 || Boolean(item.variantBreakReadyAt) || Boolean(item.variantBreakBeganAt);
  const boardLabel = breakRoster
    ? item.variantBreakBeganAt
      ? "Break roster"
      : "Sold roster"
    : variantBuyerSelectLabel(item.salesFormat);
  const canHostEdit = hostMode && !breakRoster;
  const viewerKey = highlightUsername?.trim().replace(/^@+/, "").toLowerCase() ?? "";

  if (minimized) {
    return (
      <div className="pointer-events-auto flex max-w-lg items-center gap-2 rounded-full border border-white/10 bg-zinc-950/90 py-1.5 pl-3 pr-1.5 shadow-lg backdrop-blur-xl">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold text-zinc-200">{item.title}</p>
          <p className="text-[9px] font-semibold text-emerald-300/90">
            {breakRoster
              ? `${rows.length} teams · tap Expand to view buyers`
              : `${available} open · ${rows.length} spots`}
          </p>
        </div>
        {canHostEdit && onAddSupplemental ? (
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
            {breakRoster
              ? item.variantBreakBeganAt
                ? `Break in progress · ${soldCount} sold${unavailableCount ? ` · ${unavailableCount} unavailable` : ""}`
                : `All spots sold · ${soldCount} sold${unavailableCount ? ` · ${unavailableCount} unavailable` : ""}`
              : `${available} open · ${soldCount} sold${unavailableCount ? ` · ${unavailableCount} unavailable` : ""}`}
            {canHostEdit && onPinVariant ? " · use Pin on a team to feature it for buyers" : ""}
          </p>
        </div>
        {hostMode || onToggleMinimized ? (
          <div className="flex shrink-0 items-center gap-1">
            {canHostEdit && onEditSpots ? (
              <button
                type="button"
                disabled={hostBusy}
                onClick={onEditSpots}
                className="rounded-lg border border-amber-300/35 bg-amber-500/15 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-amber-100 disabled:opacity-40"
              >
                Edit prices
              </button>
            ) : null}
            {canHostEdit && onAddSupplemental ? (
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
                aria-label={hostMode ? "Minimize spot board" : "Close spot board"}
                className="rounded-lg border border-white/12 bg-black/40 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-zinc-400 hover:text-zinc-200"
              >
                {hostMode ? "−" : "Close"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex max-h-[min(42vh,320px)] flex-wrap gap-2 overflow-y-auto pr-0.5">
        {rows.map((r) => {
          const closed = r.sold || r.unavailable;
          const pinned = r.isHot && !closed;
          const rowBuyer = r.buyerUsername?.trim().replace(/^@+/, "").toLowerCase() ?? "";
          const mine = Boolean(viewerKey && r.sold && rowBuyer === viewerKey);
          const canPin = hostSpotBoardPinEnabled({
            hostMode,
            hasPinHandler: Boolean(onPinVariant),
            variantId: r.variantId,
            sold: closed,
          });
          const tileClass = `relative min-w-[5.5rem] max-w-[48%] flex-grow rounded-full border px-3 py-2 ${
            mine
              ? "border-gold/70 bg-gold/15 ring-1 ring-gold/35"
              : r.unavailable
                ? "border-white/10 bg-white/[0.02] opacity-70"
                : r.sold
                  ? "border-emerald-400/25 bg-emerald-950/25"
                  : pinned
                    ? "border-amber-300/70 bg-amber-500/15 ring-1 ring-amber-300/40"
                    : r.isHot
                      ? "border-amber-400/40 bg-amber-500/10"
                      : "border-white/15 bg-white/[0.03]"
          }`;

          const inner = (
            <>
              {mine ? (
                <span className="absolute -top-1.5 right-2 rounded-full border border-gold/50 bg-gold px-1.5 py-0.5 text-[8px] font-black uppercase text-zinc-950">
                  Yours
                </span>
              ) : pinned ? (
                <span className="absolute -top-1.5 right-2 rounded-full border border-amber-200/40 bg-amber-400 px-1.5 py-0.5 text-[8px] font-black uppercase text-zinc-950">
                  Pinned
                </span>
              ) : r.isHot && !closed ? (
                <span className="absolute -top-1.5 right-2 rounded-full border border-white/20 bg-red-600 px-1.5 py-0.5 text-[8px] font-black uppercase text-white">
                  Hot
                </span>
              ) : null}
              <div className="flex items-start justify-between gap-1">
                <p className={`text-xs font-bold ${closed ? "text-zinc-400" : "text-zinc-100"}`}>{r.label}</p>
                {canHostEdit && onToggleHot && r.variantId && !onPinVariant && !closed ? (
                  <button
                    type="button"
                    onClick={() => onToggleHot(r.variantId!, !r.isHot)}
                    className="text-[9px] text-zinc-500 hover:text-amber-300"
                    aria-label={`Toggle hot for ${r.label}`}
                  >
                    ★
                  </button>
                ) : null}
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <p
                  className={`font-mono text-[10px] font-bold ${
                    r.unavailable
                      ? "text-zinc-500"
                      : r.sold
                        ? "text-emerald-200"
                        : "text-zinc-500"
                  }`}
                >
                  {r.unavailable
                    ? formatUnavailableSpotLabel()
                    : r.sold
                      ? formatSoldSpotBuyerLabel(r.buyerUsername)
                      : fmtMoney(r.priceUsd)}
                </p>
                {canPin && r.variantId ? (
                  <button
                    type="button"
                    disabled={pinBusy}
                    onClick={() => onPinVariant!(r.variantId!)}
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wide ${
                      pinned
                        ? "border-amber-300/55 bg-amber-500/20 text-amber-100"
                        : "border-white/15 bg-black/35 text-zinc-200 hover:border-amber-300/45"
                    }`}
                    aria-label={`Pin ${r.label} for buyers`}
                  >
                    {pinned ? "Pinned" : "Pin"}
                  </button>
                ) : null}
              </div>
            </>
          );

          return (
            <div key={r.id} className={tileClass}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
