import { liveAuctionUnitsRemaining } from "@/lib/live-auction-host-start";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import type { LiveRoomItemStatus } from "@/generated/prisma/client";

export type UnpinnedActiveItemRow = {
  title?: string | null;
  salesFormat: string | null;
  quantity: number;
  quantityInitial: number | null;
  status: string;
  variants?: { quantityRemaining: number; status: string }[] | null;
};

/**
 * When pinning a new lot, demote the prior active row to sold only when fully exhausted.
 *
 * Team/division spot boards (`isVariantSalesFormat`) are the exception: even once every spot is
 * sold, stay `queued` here rather than auto-flipping to `sold`. Sellers want the board to stay
 * reachable (re-pin it) so they can review who bought which team/division before closing it out
 * — auto-marking it sold the instant the host moves to the next lot yanked it out of the queue
 * list (`VaultQueueList` only shows `queued` items) and made the roster unreachable mid-show. The
 * seller still has an explicit "Mark sold" action (`onSold`) for when they're actually done.
 */
export function resolveUnpinnedActiveItemStatus(item: UnpinnedActiveItemRow): LiveRoomItemStatus {
  if (isVariantSalesFormat(item.salesFormat)) {
    return "queued";
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
