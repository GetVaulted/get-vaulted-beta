"use client";

import { LiveVariantSpotBoard } from "@/components/live-auction/LiveVariantSpotBoard";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";

type QueueRowLite = { item: LiveRoomItemDTO };

type Props = {
  activeBoardRow: QueueRowLite | null;
  previewQueueRow: QueueRowLite | null;
  overlayDiffersFromActive: boolean;
  busy: boolean;
  onPushSelected: () => void;
  commerceMinimized?: boolean;
  onToggleCommerceMinimized?: () => void;
  onAddSupplemental?: () => void;
};

/**
 * Stage overlay for variant/team-break spot sales — only the DB-active item is purchasable
 * (matches buyer mobile). Selected-but-not-pinned lots show a push prompt instead.
 */
export function HostVariantCommerceStage({
  activeBoardRow,
  previewQueueRow,
  overlayDiffersFromActive,
  busy,
  onPushSelected,
  commerceMinimized = false,
  onToggleCommerceMinimized,
  onAddSupplemental,
}: Props) {
  const activeVariant =
    activeBoardRow != null && isVariantSalesFormat(activeBoardRow.item.salesFormat);
  const previewVariant =
    previewQueueRow != null && isVariantSalesFormat(previewQueueRow.item.salesFormat);

  if (activeVariant) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-28 z-[14] hidden justify-center px-4 min-[1400px]:flex">
        <LiveVariantSpotBoard
          item={activeBoardRow.item}
          pinned
          hostMode
          minimized={commerceMinimized}
          onToggleMinimized={onToggleCommerceMinimized}
          onAddSupplemental={onAddSupplemental}
          hostBusy={busy}
        />
      </div>
    );
  }

  if (overlayDiffersFromActive && previewVariant) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-28 z-[14] hidden justify-center px-4 min-[1400px]:flex">
        <div className="pointer-events-auto max-w-md rounded-2xl border border-amber-400/35 bg-zinc-950/90 px-4 py-3 text-center shadow-[0_20px_60px_-24px_rgba(0,0,0,0.9)] ring-1 ring-amber-300/20 backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200/90">Not live for buyers</p>
          <p className="mt-1 text-sm font-bold text-white">{previewQueueRow.item.displayTitle || previewQueueRow.item.title}</p>
          <p className="mt-1 text-[11px] leading-snug text-zinc-300">
            Push this item to the block so buyers see divisions/spots for sale. Preview-only until pinned active.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onPushSelected}
            className="mt-3 w-full rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-500/30 to-yellow-300/20 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-amber-50 disabled:opacity-40"
          >
            Push item
          </button>
        </div>
      </div>
    );
  }

  return null;
}
