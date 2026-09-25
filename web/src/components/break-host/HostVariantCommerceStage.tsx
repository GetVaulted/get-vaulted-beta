"use client";

import { LiveVariantSpotBoard } from "@/components/live-auction/LiveVariantSpotBoard";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";

type QueueRowLite = { item: LiveRoomItemDTO };

type MarkSoldArgs = {
  variantId: string;
  username: string;
  priceUsd: number;
  settlementMethod: string;
  zeroReason?: string;
  note?: string;
};

type Props = {
  activeBoardRow: QueueRowLite | null;
  busy: boolean;
  commerceMinimized?: boolean;
  onToggleCommerceMinimized?: () => void;
  onAddSupplemental?: () => void;
  onRepeatSupplemental?: () => void;
  repeatSupplementalLabel?: string | null;
  onEditSpots?: () => void;
  onPinVariant?: (variantId: string) => void;
  pinVariantBusy?: boolean;
  /** Live room id — enables the username autocomplete strip in the Mark Sold form. */
  liveRoomId?: string;
  /** Host marks an open spot sold off-platform (cash/Venmo/etc.) to a specific username. */
  onMarkSold?: (args: MarkSoldArgs) => void | Promise<void>;
  markSoldBusy?: boolean;
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
  onRepeatSupplemental,
  repeatSupplementalLabel,
  onEditSpots,
  onPinVariant,
  pinVariantBusy = false,
  liveRoomId,
  onMarkSold,
  markSoldBusy = false,
}: Props) {
  const activeVariant =
    activeBoardRow != null && isVariantSalesFormat(activeBoardRow.item.salesFormat);

  if (activeVariant) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-28 z-[14] flex flex-col items-center gap-2 px-4">
        <LiveVariantSpotBoard
          item={activeBoardRow.item}
          hostMode
          minimized={commerceMinimized}
          onToggleMinimized={onToggleCommerceMinimized}
          onAddSupplemental={onAddSupplemental}
          onRepeatSupplemental={onRepeatSupplemental}
          repeatSupplementalLabel={repeatSupplementalLabel}
          hostBusy={busy}
          onEditSpots={onEditSpots}
          onPinVariant={
            activeBoardRow.item.status === "active" && activeBoardRow.item.variantAssignmentMode !== "random"
              ? onPinVariant
              : undefined
          }
          pinBusy={pinVariantBusy}
          liveRoomId={liveRoomId}
          onMarkSold={onMarkSold}
          markSoldBusy={markSoldBusy}
        />
      </div>
    );
  }

  return null;
}
