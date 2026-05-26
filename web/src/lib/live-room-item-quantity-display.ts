export const MAX_LIVE_ROOM_ITEM_QUANTITY = 512;

export function clampLiveRoomItemQuantity(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_LIVE_ROOM_ITEM_QUANTITY, Math.max(1, Math.floor(n)));
}

export function normalizeQuantityInitial(row: {
  quantity: number;
  quantityInitial?: number | null;
}): number {
  const initRaw = row.quantityInitial;
  if (typeof initRaw === "number" && Number.isFinite(initRaw) && initRaw >= 1) {
    return clampLiveRoomItemQuantity(initRaw);
  }
  const q = row.quantity;
  if (typeof q === "number" && Number.isFinite(q) && q >= 1) {
    return clampLiveRoomItemQuantity(q);
  }
  return 1;
}

export type LiveRoomItemQuantityState = {
  totalQuantity: number;
  remainingQuantity: number;
  soldQuantity: number;
  currentUnitNumber: number | null;
  displayTitle: string;
  progressLabel: string | null;
};

export function formatLiveQueueItemUnitTitle(title: string, unitNumber: number): string {
  const base = title.trim() || "Item";
  return `${base} #${unitNumber}`;
}

/**
 * Derive numbered-unit display for a queue row.
 * `quantity` is remaining units after timed-auction sales; `quantityInitial` is the original total.
 * Pass `unitsClaimed` for break PYT rows where quantity may not decrement until all spots are taken.
 */
export function resolveLiveRoomItemQuantityState(input: {
  title: string;
  quantity: number;
  quantityInitial?: number | null;
  status: string;
  unitsClaimed?: number | null;
}): LiveRoomItemQuantityState {
  const title = input.title.trim() || "Item";
  const totalQuantity = normalizeQuantityInitial({
    quantity: input.quantity,
    quantityInitial: input.quantityInitial,
  });

  if (totalQuantity <= 1) {
    return {
      totalQuantity: 1,
      remainingQuantity: input.status === "sold" ? 0 : 1,
      soldQuantity: input.status === "sold" ? 1 : 0,
      currentUnitNumber: null,
      displayTitle: title,
      progressLabel: null,
    };
  }

  const rawRemaining =
    typeof input.quantity === "number" && Number.isFinite(input.quantity) ? Math.floor(input.quantity) : totalQuantity;
  const unitsClaimed =
    typeof input.unitsClaimed === "number" && Number.isFinite(input.unitsClaimed)
      ? Math.max(0, Math.floor(input.unitsClaimed))
      : null;

  let soldQuantity: number;
  let remainingQuantity: number;

  if (input.status === "sold" && rawRemaining <= 0) {
    soldQuantity = totalQuantity;
    remainingQuantity = 0;
  } else if (unitsClaimed != null) {
    soldQuantity = Math.min(totalQuantity, unitsClaimed);
    remainingQuantity = Math.max(0, totalQuantity - soldQuantity);
  } else {
    remainingQuantity = input.status === "sold" ? 0 : Math.max(0, rawRemaining);
    soldQuantity = Math.min(totalQuantity, totalQuantity - remainingQuantity);
  }

  const currentUnitNumber =
    input.status === "active" && remainingQuantity > 0 ? soldQuantity + 1 : null;

  const displayTitle =
    currentUnitNumber != null ? formatLiveQueueItemUnitTitle(title, currentUnitNumber) : title;

  const progressLabel =
    soldQuantity >= totalQuantity
      ? `${totalQuantity} / ${totalQuantity} sold`
      : `${soldQuantity} / ${totalQuantity} sold`;

  return {
    totalQuantity,
    remainingQuantity,
    soldQuantity,
    currentUnitNumber,
    displayTitle,
    progressLabel,
  };
}

/** Unit index for the sale that is about to close (1-based). */
export function resolveClosingUnitNumber(row: {
  quantity: number;
  quantityInitial?: number | null;
}): number {
  const total = normalizeQuantityInitial(row);
  const remaining = Math.max(0, Math.floor(row.quantity));
  return Math.min(total, total - remaining + 1);
}
