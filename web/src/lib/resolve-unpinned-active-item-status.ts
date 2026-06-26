import { liveAuctionUnitsRemaining } from "@/lib/live-auction-host-start";
import { allVariantSpotsSold, isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import type { LiveRoomItemStatus } from "@/generated/prisma/client";

export type UnpinnedActiveItemRow = {
  title?: string | null;
  salesFormat: string | null;
  quantity: number;
  quantityInitial: number | null;
  status: string;
  variants?: { quantityRemaining: number; status: string }[] | null;
};

/** When pinning a new lot, demote the prior active row to sold only when fully exhausted. */
export function resolveUnpinnedActiveItemStatus(item: UnpinnedActiveItemRow): LiveRoomItemStatus {
  if (isVariantSalesFormat(item.salesFormat)) {
    return allVariantSpotsSold(item.variants ?? []) ? "sold" : "queued";
  }
  if (
    liveAuctionUnitsRemaining({
      title: item.title ?? "Item",
      quantity: item.quantity,
      quantityInitial: item.quantityInitial,
      status: item.status,
    }) <= 0
  ) {
    return "sold";
  }
  return "queued";
}
