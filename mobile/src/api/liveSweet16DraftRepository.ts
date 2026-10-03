import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
import { fetchWebApiMobileWithSellerAuth } from '../lib/resolveSellerAccessToken';

export type Sweet16DraftPick = {
  purchaseId: string;
  turnIndex: number;
  teamLabel: string;
  teamAbbr: string;
  autoAssigned: boolean;
  buyerUsername: string | null;
};

export type Sweet16DraftSnapshot = {
  itemId: string;
  liveRoomId: string;
  status: 'not_started' | 'in_progress' | 'complete';
  turnOrder: string[];
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
  const draft = (j as { draft?: Sweet16DraftSnapshot } | null)?.draft;
  if (!draft) throw new Error('Malformed Sweet 16 draft response.');
  return draft;
}

/** Host: start the live Sweet 16 draft once all 16 slots are sold. */
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
