"use client";

import { LiveVariantSpotBoard } from "@/components/live-auction/LiveVariantSpotBoard";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";

type QueueRowLite = { item: LiveRoomItemDTO };

type Props = {
  activeBoardRow: QueueRowLite | null;
  busy: boolean;
  commerceMinimized?: boolean;
  onToggleCommerceMinimized?: () => void;
  onAddSupplemental?: () => void;
  onEditSpots?: () => void;
};

/**
 * Stage overlay for variant/team-break spot sales — only the DB-active item is purchasable
 * (matches buyer mobile). Unpinned lots stay in the lineup until the host pins them.
 */
export function HostVariantCommerceStage({
  activeBoardRow,
  busy,
  commerceMinimized = false,
  onToggleCommerceMinimized,
  onAddSupplemental,
  onEditSpots,
}: Props) {
  const activeVariant =
    activeBoardRow != null && isVariantSalesFormat(activeBoardRow.item.salesFormat);

  if (activeVariant) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-28 z-[14] hidden justify-center px-4 min-[1400px]:flex">
        <LiveVariantSpotBoard
          item={activeBoardRow.item}
          hostMode
          minimized={commerceMinimized}
          onToggleMinimized={onToggleCommerceMinimized}
          onAddSupplemental={onAddSupplemental}
          hostBusy={busy}
          onEditSpots={onEditSpots}
        />
      </div>
    );
  }

  return null;
}
