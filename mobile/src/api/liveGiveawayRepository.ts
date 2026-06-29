import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';

export type ViewerGiveawayRow = {
  id: string;
  kind: 'open' | 'buyers';
  title: string;
  prizeDescription: string;
  imageUrl: string;
  status: string;
  entryCount: number;
  entryCloseAt?: string | null;
  viewerEntered: boolean;
  viewerActiveInDrawing?: boolean;
  canEnter: boolean;
};

export type LiveGiveawayRow = {
  id: string;
  liveRoomId: string;
  kind: 'open' | 'buyers';
  title: string;
  prizeDescription: string;
  imageUrl: string;
  rulesText: string;
  amoeRulesSlug: string | null;
  amoeRulesUrl: string | null;
  status: 'draft' | 'entries_open' | 'entries_closed' | 'drawn' | 'cancelled';
  entryOpenAt: string | null;
  entryCloseAt: string | null;
  drawnAt: string | null;
  winnerUserId: string | null;
  winnerUsername: string | null;
  entryCount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateGiveawayInput = {
  kind: 'open' | 'buyers';
  title: string;
  prizeDescription?: string;
  imageUrl?: string;
  rulesText?: string;
  openEntries?: boolean;
};

export type GiveawayEntryRow = {
  userId: string;
  username: string;
  method?: 'watch_enter' | 'purchase' | 'amoe_form';
  activeInRoom?: boolean;
};

async function giveawayFetch(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  return fetchWebApiMobile(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
}

function parseError(res: Response, body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: string }).error;
    if (typeof err === 'string' && err.trim()) return err.trim();
  }
  return `Request failed (${res.status})`;
}

export async function createLiveGiveaway(
  accessToken: string,
  roomId: string,
  input: CreateGiveawayInput,
): Promise<LiveGiveawayRow> {
  const res = await giveawayFetch(`/api/live-rooms/${encodeURIComponent(roomId)}/giveaways`, accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  let j: { giveaway?: LiveGiveawayRow; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(parseError(res, j));
  if (!j.giveaway?.id) throw new Error('Invalid giveaway response.');
  return j.giveaway;
}

export type PatchLiveGiveawayResult = {
  giveaway: LiveGiveawayRow;
  spin?: {
    spinId: string;
    kind: 'giveaway' | 'break_pyt' | 'random_reveal';
    title: string;
    labels: string[];
    winnerIndex: number;
    winnerLabel: string;
    durationMs: number;
    referenceId?: string;
  };
};

export async function patchLiveGiveaway(
  accessToken: string,
  roomId: string,
  giveawayId: string,
  action: 'open_entries' | 'close_entries' | 'cancel' | 'draw',
): Promise<PatchLiveGiveawayResult> {
  const res = await giveawayFetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/giveaways/${encodeURIComponent(giveawayId)}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    },
  );
  let j: { giveaway?: LiveGiveawayRow; spin?: PatchLiveGiveawayResult['spin']; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(parseError(res, j));
  if (!j.giveaway?.id) throw new Error('Invalid giveaway response.');
  return { giveaway: j.giveaway, spin: j.spin };
}

export async function deleteLiveGiveaway(
  accessToken: string,
  roomId: string,
  giveawayId: string,
): Promise<void> {
  const res = await giveawayFetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/giveaways/${encodeURIComponent(giveawayId)}`,
    accessToken,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    let j: unknown = {};
    try {
      j = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(parseError(res, j));
  }
}

export async function enterOpenGiveaway(
  accessToken: string,
  roomId: string,
  giveawayId: string,
): Promise<void> {
  const res = await giveawayFetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/giveaways/${encodeURIComponent(giveawayId)}/enter`,
    accessToken,
    { method: 'POST' },
  );
  if (!res.ok) {
    let j: unknown = {};
    try {
      j = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(parseError(res, j));
  }
}

export async function fetchLiveGiveawayEntries(
  accessToken: string,
  roomId: string,
  giveawayId: string,
): Promise<GiveawayEntryRow[]> {
  const res = await giveawayFetch(
    `/api/live-rooms/${encodeURIComponent(roomId)}/giveaways/${encodeURIComponent(giveawayId)}/entries`,
    accessToken,
    { method: 'GET' },
  );
  let j: { entries?: GiveawayEntryRow[]; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(parseError(res, j));
  return Array.isArray(j.entries) ? j.entries : [];
}

export type PromoGiveawayPayload = {
  id: string;
  title: string;
  prizeDescription: string;
  rulesText: string;
  status: string;
  roomTitle: string;
  sellerUsername: string;
  entriesOpen: boolean;
};

export async function fetchPromoGiveaway(slug: string): Promise<PromoGiveawayPayload> {
  const res = await fetchWebApiMobile(`/api/promo-entry/${encodeURIComponent(slug)}`, {
    method: 'GET',
  });
  let j: { promo?: PromoGiveawayPayload; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(parseError(res, j));
  if (!j.promo?.id) throw new Error('Invalid promotion response.');
  return j.promo;
}

export async function submitPromoAmoeEntry(
  accessToken: string,
  slug: string,
  input: { fullName: string; email: string; mailingAddress: string },
): Promise<void> {
  const res = await fetchWebApiMobile(`/api/promo-entry/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let j: unknown = {};
    try {
      j = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(parseError(res, j));
  }
}

/** Extract AMOE slug from a full promo-entry URL or return the slug as-is. */
export function promoEntrySlugFromUrl(urlOrSlug: string): string | null {
  const raw = urlOrSlug.trim();
  if (!raw) return null;
  const match = raw.match(/\/promo-entry\/([^/?#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);
  if (!raw.includes('/') && !raw.includes('://')) return raw;
  return null;
}
