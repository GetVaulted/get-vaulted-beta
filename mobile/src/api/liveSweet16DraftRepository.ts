import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
import { fetchWebApiMobileWithSellerAuth } from '../lib/resolveSellerAccessToken';
import { normalizeSweet16Draft } from '../lib/liveSweet16Draft';

export type Sweet16DraftPick = {
  purchaseId: string;
  turnIndex: number;
  teamLabel: string;
  teamAbbr: string;
  autoAssigned: boolean;
  buyerUsername: string | null;
};

/**
 * `not_started`: sales closed, no order yet. `order_set`: the host randomized the order (everyone
 * can see it) but nobody is on the clock. `in_progress`: a buyer is on the clock. `complete`.
 */
export type Sweet16DraftStatus = 'not_started' | 'order_set' | 'in_progress' | 'complete';

/** One row of the draft order: who picks in this slot and the team they bought at checkout. */
export type Sweet16OrderRow = {
  purchaseId: string;
  turnIndex: number;
  buyerUsername: string | null;
  boughtTeamLabel: string | null;
  boughtTeamAbbr: string | null;
};

/** One of the 32 board tiles. `open` tiles are the draft pool. */
export type Sweet16BoardTile = {
  label: string;
  abbr: string;
  state: 'open' | 'purchased' | 'drafted';
  buyerUsername: string | null;
  purchaseId: string | null;
};

export type Sweet16DraftSnapshot = {
  itemId: string;
  liveRoomId: string;
  status: Sweet16DraftStatus;
  turnOrder: string[];
  order: Sweet16OrderRow[];
  board: Sweet16BoardTile[];
  /** Sales stop at this many sold teams (16). */
  maxSpots: number;
  soldCount: number;
  currentTurnIndex: number | null;
  currentTurnPurchaseId: string | null;
  currentTurnBuyerUsername: string | null;
  currentTurnDeadlineAt: string | null;
  remainingTeamLabels: string[];
  turnSeconds: number;
  startedAt: string | null;
  completedAt: string | null;
  viewerPurchaseId: string | null;
  picks: Sweet16DraftPick[];
};

/** Typed error carrying the server's machine-readable `code` (e.g. `ALREADY_STARTED`,
 * `NOT_READY`, `NOT_YOUR_TURN`) alongside a human-readable message, mirroring `LiveHostApiError`. */
export class Sweet16ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, body: { error?: string; code?: string } | null) {
    const message =
      body && typeof body.error === 'string' && body.error.trim()
        ? body.error.trim()
        : `Request failed (${status})`;
    super(message);
    this.name = 'Sweet16ApiError';
    this.status = status;
    this.code = body?.code;
  }
}

async function parseDraftResponse(res: Response): Promise<Sweet16DraftSnapshot> {
  let j: unknown = null;
  try {
    j = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Sweet16ApiError(res.status, j as { error?: string; code?: string } | null);
  const draft = normalizeSweet16Draft((j as { draft?: unknown } | null)?.draft);
  if (!draft) throw new Error('Malformed Sweet 16 draft response.');
  return draft;
}

/** Host step 1: randomize the buyers into a visible draft order (needs sales closed). */
export async function randomizeSweet16DraftOrder(
  accessToken: string,
  roomId: string,
  itemId: string,
): Promise<Sweet16DraftSnapshot> {
  const res = await fetchWebApiMobileWithSellerAuth(
    `/api/live-rooms/${encodeURIComponent(roomId)}/items/${encodeURIComponent(itemId)}/sweet16-draft/randomize-order`,
    accessToken,
    { method: 'POST' },
  );
  return parseDraftResponse(res);
}

/** Host step 2: start the draft once the order is set (the server requires the order first). */
export async function startSweet16Draft(
  accessToken: string,
  roomId: string,
  itemId: string,
): Promise<Sweet16DraftSnapshot> {
  const res = await fetchWebApiMobileWithSellerAuth(
    `/api/live-rooms/${encodeURIComponent(roomId)}/items/${encodeURIComponent(itemId)}/sweet16-draft/start`,
    accessToken,
    { method: 'POST' },
  );
  return parseDraftResponse(res);
}

/** Buyer: pick a team on your own turn. */
export async function pickSweet16DraftTeam(args: {
  accessToken: string;
  roomId: string;
  itemId: string;
  teamLabel: string;
}): Promise<Sweet16DraftSnapshot> {
  const res = await fetchWebApiMobile(
    `/api/live-rooms/${encodeURIComponent(args.roomId)}/items/${encodeURIComponent(args.itemId)}/sweet16-draft/pick`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ teamLabel: args.teamLabel }),
    },
  );
  return parseDraftResponse(res);
}

/** Any viewer: read current draft state (also used to resync after reconnect). */
export async function fetchSweet16Draft(
  accessToken: string,
  roomId: string,
  itemId: string,
): Promise<Sweet16DraftSnapshot | null> {
  const res = await fetchWebApiMobile(
    `/api/live-rooms/${encodeURIComponent(roomId)}/items/${encodeURIComponent(itemId)}/sweet16-draft`,
    {
      method: 'GET',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    },
  );
  if (res.status === 404) return null;
  return parseDraftResponse(res);
}
