type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; issues: string[] };

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function normalizeError(payload: unknown, fallback: string): { error: string; issues: string[] } {
  const j = (payload ?? {}) as { error?: unknown; issues?: unknown };
  const error = typeof j.error === "string" ? j.error : fallback;
  const issues = Array.isArray(j.issues) ? j.issues.filter((x): x is string => typeof x === "string") : [];
  return { error, issues };
}

export async function patchLiveRoomAction(
  liveRoomId: string,
  action: "start" | "end",
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const payload = await readJsonSafe<Record<string, unknown>>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not update room.");
      return { ok: false, error, issues };
    }
    return { ok: true, data: payload ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server. Check your connection and that you are signed in.",
      issues: [],
    };
  }
}

export async function deleteLiveRoomItem(liveRoomId: string, itemId: string): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
    const payload = await readJsonSafe<Record<string, unknown>>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not remove item.");
      return { ok: false, error, issues };
    }
    return { ok: true, data: payload ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server. Check your connection and that you are signed in.",
      issues: [],
    };
  }
}

/** Deletes every queued row in the room (confirm in UI first). */
export async function bulkDeleteQueuedLiveRoomItems(liveRoomId: string): Promise<ApiResult<{ deleted?: number }>> {
  try {
    const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/bulk-delete-queued`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const payload = await readJsonSafe<{ deleted?: number; error?: string; issues?: string[] }>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not clear queued items.");
      return { ok: false, error, issues };
    }
    return { ok: true, data: payload ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server. Check your connection and that you are signed in.",
      issues: [],
    };
  }
}

/**
 * Nudge the server to finalize any overdue auction lot (timer reached zero). The server re-checks
 * `auctionEndsAt` against its own clock, so this can never close a lot early; it only accelerates
 * the inevitable auto-close instead of waiting for the next room poll. Best-effort and idempotent.
 */
export async function finalizeOverdueLiveAuctions(liveRoomId: string): Promise<void> {
  try {
    await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/finalize-overdue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
  } catch {
    /* best-effort; the GET read-sweep is the backstop */
  }
}

export async function patchLiveRoomItemStatus(
  liveRoomId: string,
  itemId: string,
  status: "queued" | "active" | "sold" | "skipped",
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await readJsonSafe<Record<string, unknown>>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not update item.");
      return { ok: false, error, issues };
    }
    return { ok: true, data: payload ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server. Check your connection and that you are signed in.",
      issues: [],
    };
  }
}

/** Opens timed bidding on the active lot (host only; room must be live). */
export async function startLiveRoomItemAuction(
  liveRoomId: string,
  itemId: string,
  auctionDurationSec: number,
  clutchTimeEnabled = false,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const durRaw = Number(auctionDurationSec);
    const dur = Number.isFinite(durRaw) && durRaw >= 3 ? Math.floor(durRaw) : 5;
    const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "startAuction", auctionDurationSec: dur, clutchTimeEnabled }),
    });
    const payload = await readJsonSafe<Record<string, unknown>>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not start bidding.");
      return { ok: false, error, issues };
    }
    return { ok: true, data: payload ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server. Check your connection and that you are signed in.",
      issues: [],
    };
  }
}

/** Host begins a variant team break after all spots sell. */
export async function beginLiveRoomTeamBreak(
  liveRoomId: string,
  itemId: string,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "beginTeamBreak" }),
    });
    const payload = await readJsonSafe<Record<string, unknown>>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not begin break.");
      return { ok: false, error, issues };
    }
    return { ok: true, data: payload ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server.",
      issues: [],
    };
  }
}

/** Bulk-update spot prices / hot flags on a live break item. */
export async function patchLiveItemVariants(
  liveRoomId: string,
  itemId: string,
  updates: Array<{ id: string; priceUsd?: number; isHot?: boolean }>,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch(
      `/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(itemId)}/variants`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ updates }),
      },
    );
    const payload = await readJsonSafe<Record<string, unknown>>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not update spots.");
      return { ok: false, error, issues };
    }
    return { ok: true, data: payload ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server.",
      issues: [],
    };
  }
}

export type ManualAssignVariantResult = {
  purchaseId: string;
  buyerUsername: string;
  label: string;
  totalUsd: number;
  platformFeeCents: number;
  platformFeePercent: number;
  platformFeeStatus: string;
  platformFeeDue: boolean;
};

/** Mark a team-board / spot-board variant sold off-platform to a specific username (host manual settlement). */
export async function manualAssignLiveItemVariant(
  liveRoomId: string,
  itemId: string,
  variantId: string,
  body: {
    username: string;
    priceUsd: number;
    settlementMethod: string;
    zeroReason?: string;
    note?: string;
  },
): Promise<ApiResult<ManualAssignVariantResult>> {
  try {
    const res = await fetch(
      `/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(itemId)}/variants/${encodeURIComponent(variantId)}/manual-assign`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      },
    );
    const payload = await readJsonSafe<Record<string, unknown>>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not mark team sold.");
      return { ok: false, error, issues };
    }
    const p = (payload ?? {}) as Record<string, unknown>;
    const data: ManualAssignVariantResult = {
      purchaseId: typeof p.purchaseId === "string" ? p.purchaseId : "",
      buyerUsername: typeof p.buyerUsername === "string" ? p.buyerUsername : "",
      label: typeof p.label === "string" ? p.label : "",
      totalUsd: typeof p.totalUsd === "number" ? p.totalUsd : 0,
      platformFeeCents: typeof p.platformFeeCents === "number" ? p.platformFeeCents : 0,
      platformFeePercent: typeof p.platformFeePercent === "number" ? p.platformFeePercent : 0,
      platformFeeStatus: typeof p.platformFeeStatus === "string" ? p.platformFeeStatus : "",
      platformFeeDue: Boolean(p.platformFeeDue),
    };
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server.",
      issues: [],
    };
  }
}

/** Append supplemental spot/division variants to the active variant item (same lot — buyers see immediately). */
export async function appendLiveItemSupplementalVariants(
  liveRoomId: string,
  itemId: string,
  supplemental: {
    name: string;
    priceUsd: number;
    spotCount: number;
    feedsIntoTitle: string;
  },
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch(
      `/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(itemId)}/variants`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ supplemental }),
      },
    );
    const payload = await readJsonSafe<Record<string, unknown>>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not add supplemental.");
      return { ok: false, error, issues };
    }
    return { ok: true, data: payload ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server.",
      issues: [],
    };
  }
}

export async function createLiveRoomItem(
  liveRoomId: string,
  body: {
    title: string;
    listingId?: string | null;
    imageUrl?: string;
    priceUsd?: number | null;
    startingBidUsd?: number | null;
    teamBoardMisc?: boolean;
    teamBoardNcaa?: boolean;
    customRandomPoolLabels?: string[] | null;
    /** Units on this queue row (one tile). */
    quantity?: number;
    salesFormat?: string;
    variants?: unknown;
    variantAssignmentMode?: "pick" | "random";
    shippingProfileId?: string | null;
    sellerShippingProfileId?: string | null;
  },
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const payload = await readJsonSafe<Record<string, unknown>>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not create item.");
      return { ok: false, error, issues };
    }
    return { ok: true, data: payload ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server. Check your connection and that you are signed in.",
      issues: [],
    };
  }
}

export type LiveShopInventoryListing = {
  id: string;
  title: string;
  imageUrl: string;
  priceUsd: number | null;
  startingBidUsd: number | null;
  buyingFormat: string;
  status: string;
  inventoryChannel: "marketplace" | "live_show";
  alreadyInQueue: boolean;
  inventoryHeld: boolean;
  available: boolean;
};

export async function fetchLiveRoomShopInventory(
  liveRoomId: string,
): Promise<ApiResult<{ listings: LiveShopInventoryListing[] }>> {
  try {
    const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/shop-inventory`, {
      cache: "no-store",
      credentials: "include",
    });
    const payload = await readJsonSafe<{ listings?: LiveShopInventoryListing[]; error?: string }>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not load shop inventory.");
      return { ok: false, error, issues };
    }
    return { ok: true, data: { listings: Array.isArray(payload?.listings) ? payload.listings : [] } };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server.",
      issues: [],
    };
  }
}

export type PriorLiveRoomOption = {
  id: string;
  title: string;
  status: string;
  updatedAt?: string | null;
};

export async function fetchPriorLiveRoomsForCopy(
  currentRoomId: string,
): Promise<ApiResult<{ rooms: PriorLiveRoomOption[] }>> {
  try {
    const res = await fetch(`/api/live-rooms?mine=1&includeEnded=1&limit=40`, {
      cache: "no-store",
      credentials: "include",
    });
    const payload = await readJsonSafe<{ rooms?: PriorLiveRoomOption[]; error?: string }>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not load prior shows.");
      return { ok: false, error, issues };
    }
    const rooms = (Array.isArray(payload?.rooms) ? payload.rooms : []).filter(
      (r) => r.id && r.id !== currentRoomId,
    );
    return { ok: true, data: { rooms } };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server.",
      issues: [],
    };
  }
}

export async function importLiveRoomItemsFromRoom(
  liveRoomId: string,
  sourceRoomId: string,
): Promise<ApiResult<{ imported: number; skipped: number; sourceTitle?: string }>> {
  try {
    const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/import-from-room`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sourceRoomId }),
    });
    const payload = await readJsonSafe<{
      imported?: number;
      skipped?: number;
      sourceTitle?: string;
      error?: string;
    }>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not copy lineup.");
      return { ok: false, error, issues };
    }
    return {
      ok: true,
      data: {
        imported: typeof payload?.imported === "number" ? payload.imported : 0,
        skipped: typeof payload?.skipped === "number" ? payload.skipped : 0,
        sourceTitle: payload?.sourceTitle,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server.",
      issues: [],
    };
  }
}

export async function sendLiveRoomSystemMessage(
  liveRoomId: string,
  body: string,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/host-system-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const payload = await readJsonSafe<Record<string, unknown>>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not send system message.");
      return { ok: false, error, issues };
    }
    return { ok: true, data: payload ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server. Check your connection and that you are signed in.",
      issues: [],
    };
  }
}

export type LiveLotSaleType = "auction" | "buy_now";

/**
 * Save plain (non-variant) lot pricing from the host queue editor: starting bid / buy-it-now
 * price, quantity, and — when the sale type changed — the format switch. Mirrors the mobile app's
 * `onSaveQueuePricing` (updates pricing first, then flips format, so there's never a window where
 * a buy-it-now lot is buyable at a stale $1 default while switching to auction).
 */
export async function patchLiveRoomItemLotPricing(
  liveRoomId: string,
  itemId: string,
  args: {
    saleType: LiveLotSaleType;
    previousSaleType: LiveLotSaleType;
    quantity: number;
    startingBidUsd: number | null;
    reservePriceUsd: number | null;
    priceUsd: number | null;
  },
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        quantity: args.quantity,
        startingBidUsd: args.startingBidUsd,
        reservePriceUsd: args.reservePriceUsd,
        priceUsd: args.priceUsd,
      }),
    });
    const payload = await readJsonSafe<Record<string, unknown>>(res);
    if (!res.ok) {
      const { error, issues } = normalizeError(payload, "Could not update pricing.");
      return { ok: false, error, issues };
    }
    if (args.saleType === args.previousSaleType) {
      return { ok: true, data: payload ?? {} };
    }
    const res2 = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "setCommerceFormat", salesFormat: args.saleType }),
    });
    const payload2 = await readJsonSafe<Record<string, unknown>>(res2);
    if (!res2.ok) {
      const { error, issues } = normalizeError(payload2, "Pricing saved, but could not switch the sale type.");
      return { ok: false, error, issues };
    }
    return { ok: true, data: payload2 ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    return {
      ok: false,
      error: msg ? `Could not reach the server (${msg}).` : "Could not reach the server.",
      issues: [],
    };
  }
}
