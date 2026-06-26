"use client";

import { LiveVariantSpotBoard } from "@/components/live-auction/LiveVariantSpotBoard";
import { ExternalFulfillmentNotice } from "@/components/shipping/ExternalFulfillmentNotice";
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
  onPinVariant?: (variantId: string) => void;
  pinVariantBusy?: boolean;
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
  onPinVariant,
  pinVariantBusy = false,
}: Props) {
  const activeVariant =
    activeBoardRow != null && isVariantSalesFormat(activeBoardRow.item.salesFormat);

  if (activeVariant) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-28 z-[14] flex flex-col items-center gap-2 px-4">
        <div className="pointer-events-auto w-full max-w-lg">
          <ExternalFulfillmentNotice audience="host" compact />
        </div>
        <LiveVariantSpotBoard
          item={activeBoardRow.item}
          hostMode
          minimized={commerceMinimized}
          onToggleMinimized={onToggleCommerceMinimized}
          onAddSupplemental={onAddSupplemental}
          hostBusy={busy}
          onEditSpots={onEditSpots}
          onPinVariant={
            activeBoardRow.item.status === "active" && activeBoardRow.item.variantAssignmentMode !== "random"
              ? onPinVariant
              : undefined
          }
          pinBusy={pinVariantBusy}
        />
      </div>
    );
  }

  return null;
}
