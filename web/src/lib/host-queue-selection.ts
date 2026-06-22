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

/** Timed auction with bidding open — host must end/close before pinning another lot. */
export function hostPinLotBlocked(activeRow: QueueRowLite | null | undefined): boolean {
  const active = activeRow?.item;
  if (!active) return false;
  return !isVariantSalesFormat(active.salesFormat) && active.biddingOpen === true;
}

export const HOST_PIN_BLOCKED_AUCTION_LIVE_MSG =
  "End the live auction before pinning another lot.";
