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
}

export async function deleteLiveRoomItem(liveRoomId: string, itemId: string): Promise<ApiResult<Record<string, unknown>>> {
  const res = await fetch(`/api/live-rooms/${encodeURIComponent(liveRoomId)}/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
  const payload = await readJsonSafe<Record<string, unknown>>(res);
  if (!res.ok) {
    const { error, issues } = normalizeError(payload, "Could not remove item.");
    return { ok: false, error, issues };
  }
  return { ok: true, data: payload ?? {} };
}

/** Deletes every queued row in the room (confirm in UI first). */
export async function bulkDeleteQueuedLiveRoomItems(liveRoomId: string): Promise<ApiResult<{ deleted?: number }>> {
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
    /** Units on this queue row (one tile). */
    quantity?: number;
    salesFormat?: string;
    variants?: unknown;
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

export async function sendLiveRoomSystemMessage(
  liveRoomId: string,
  body: string,
): Promise<ApiResult<Record<string, unknown>>> {
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
}
