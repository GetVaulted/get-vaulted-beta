import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";
import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";

type QueueRowLite = { item: LiveRoomItemDTO };

export function resolveHostPreviewItem(previewRow: QueueRowLite | null | undefined): LiveRoomItemDTO | null {
  const item = previewRow?.item;
  if (!item) return null;
  const status = item.status.toLowerCase();
  if (status === "active" || status === "sold" || status === "skipped") return null;
  return item;
}

/** Host stage / rail state when the lineup selection differs from the pinned active lot. */
export function hostQueueSwitchPinState(args: {
  activeRow: QueueRowLite | null;
  previewRow: QueueRowLite | null | undefined;
}) {
  const active = args.activeRow?.item ?? null;
  const preview = resolveHostPreviewItem(args.previewRow);
  const differs = Boolean(active && preview && active.id !== preview.id);
  const activeIsVariant = active ? isVariantSalesFormat(active.salesFormat) : false;
  const previewIsVariant = preview ? isVariantSalesFormat(preview.salesFormat) : false;
  const previewIsAuction = Boolean(preview && !previewIsVariant);
  const switchAwaitingPin = differs && preview != null;
  const switchFromVariantToAuction = switchAwaitingPin && activeIsVariant && previewIsAuction;
  const awaitingFirstPin = !active && preview != null;

  return {
    preview,
    differs,
    activeIsVariant,
    previewIsVariant,
    previewIsAuction,
    switchAwaitingPin,
    switchFromVariantToAuction,
    awaitingFirstPin,
  };
}

/**
 * Timed auction / pending settle — host must not pin another lot until this one is
 * sold or closed. Allowing pin after the timer hits zero (but before settle) used to
 * demote the prior winner without charging, then settle/charge that lot while buyers
 * were already looking at the next auction.
 */
export function hostPinLotBlocked(
  activeRow: QueueRowLite | null | undefined,
  _nowMs: number = Date.now(),
): boolean {
  const active = activeRow?.item;
  if (!active) return false;
  if (isVariantSalesFormat(active.salesFormat)) return false;
  if (active.biddingOpen === true) return true;
  if (Boolean(active.lastHighBidderId?.trim())) return true;
  return false;
}

export const HOST_PIN_BLOCKED_AUCTION_LIVE_MSG =
  "Finish settling the current auction before pinning another lot.";
