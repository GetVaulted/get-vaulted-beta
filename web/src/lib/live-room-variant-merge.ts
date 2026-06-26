import type { LiveRoomItemDTO } from "@/lib/live-room-serialize";
import type { LiveItemVariantStatus } from "@/generated/prisma/client";
import { summarizeVariantSpots } from "@/lib/live-item-variant-presets";

export type VariantPurchasedMergePayload = {
  itemId: string;
  variantId: string;
  itemVersion?: number;
  quantity?: number;
};

/** Apply a PYT/PYD spot purchase to in-memory room items (instant buyer/host UI). */
export function mergeVariantPurchasedIntoItems(
  items: LiveRoomItemDTO[],
  payload: VariantPurchasedMergePayload,
): LiveRoomItemDTO[] {
  const qty = typeof payload.quantity === "number" && payload.quantity > 0 ? Math.floor(payload.quantity) : 1;
  return items.map((it) => {
    if (it.id !== payload.itemId || !it.variants?.length) return it;
    const itemVersion =
      typeof payload.itemVersion === "number"
        ? Math.max(it.itemVersion ?? 0, payload.itemVersion)
        : (it.itemVersion ?? 0) + 1;
    const variants = it.variants.map((v) => {
      if (v.id !== payload.variantId) return v;
      const quantityRemaining = Math.max(0, v.quantityRemaining - qty);
      const soldCount = Math.max(0, (v.soldCount ?? 0) + qty);
      const soldOut = quantityRemaining <= 0;
      const status: LiveItemVariantStatus = soldOut ? "sold_out" : v.status === "sold_out" ? "available" : v.status;
      return {
        ...v,
        quantityRemaining,
        soldCount,
        status,
        ...(soldOut ? { isHot: false } : {}),
      };
    });
    return { ...it, variants, itemVersion };
  });
}

/**
 * When `itemVersion` ties on fetch merge, prefer the row whose variant inventory reflects more sales.
 */
export function pickNewerVariantAwareLiveRoomItem(
  prev: LiveRoomItemDTO,
  incoming: LiveRoomItemDTO,
): LiveRoomItemDTO {
  const pv = prev.itemVersion ?? 0;
  const iv = incoming.itemVersion ?? 0;
  if (pv > iv) return prev;
  if (iv > pv) return incoming;
  if (prev.variants?.length && incoming.variants?.length) {
    const prevSold = summarizeVariantSpots(prev.variants).sold;
    const incSold = summarizeVariantSpots(incoming.variants).sold;
    if (incSold !== prevSold) return incSold > prevSold ? incoming : prev;
    const prevAvail = summarizeVariantSpots(prev.variants).available;
    const incAvail = summarizeVariantSpots(incoming.variants).available;
    if (incAvail !== prevAvail) return incAvail < prevAvail ? incoming : prev;
  }
  return incoming;
}
