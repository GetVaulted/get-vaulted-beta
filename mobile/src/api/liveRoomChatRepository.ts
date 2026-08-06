import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';
import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
import { resolveSellerAccessToken } from '../lib/resolveSellerAccessToken';

export type LiveRoomChatMessageType = 'chat' | 'bid' | 'purchase' | 'system' | 'tip' | 'staff';

export type LiveRoomChatMessageRow = {
  id: string;
  senderId?: string;
  senderUsername: string;
  senderAvatarUrl?: string | null;
  body: string;
  messageType?: LiveRoomChatMessageType;
  createdAt: string;
  mentions?: { userId: string; username: string }[];
};

function apiErrorMessage(res: Response, body: unknown): string {
  if (body && typeof body === 'object') {
    const o = body as { error?: string };
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
  }
  return `Request failed (${res.status})`;
}

export async function fetchLiveRoomChatMessages(
  roomId: string,
  accessToken?: string,
): Promise<LiveRoomChatMessageRow[]> {
  const headers: Record<string, string> = {};
  if (accessToken?.trim()) {
    try {
      const token = await resolveSellerAccessToken(accessToken);
      headers.Authorization = `Bearer ${token}`;
    } catch {
      headers.Authorization = `Bearer ${accessToken.trim()}`;
    }
  }
  const res = await fetchWebApiMobile(`/api/live-rooms/${encodeURIComponent(roomId)}/messages`, {
    headers: Object.keys(headers).length ? headers : undefined,
  });
  let j: { messages?: LiveRoomChatMessageRow[]; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  return Array.isArray(j.messages) ? j.messages : [];
}

export async function sendLiveRoomChatMessage(args: {
  accessToken: string;
  roomId: string;
  body: string;
  clientMessageId?: string;
  /** Host/mod only — hidden from buyers. */
  staffOnly?: boolean;
}): Promise<LiveRoomChatMessageRow> {
  const payload: { body: string; clientMessageId?: string; staffOnly?: boolean } = {
    body: args.body.trim(),
  };
  if (args.clientMessageId?.trim()) payload.clientMessageId = args.clientMessageId.trim();
  if (args.staffOnly) payload.staffOnly = true;
  // Chat posts can lag under live-show load; a short timeout made buyers mash Send while the
  // first request was still finishing (draft popped back into the input on each failure).
  // Use authed fetch so a stale React accessToken mid-show refreshes instead of "Sign in to chat."
  const res = await fetchWebApiAuthed(
    `/api/live-rooms/${encodeURIComponent(args.roomId)}/messages`,
    args.accessToken,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { timeoutMs: 25_000 },
  );
  let j: { message?: LiveRoomChatMessageRow; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  if (!j.message?.id) throw new Error('Server did not return a chat message.');
  return j.message;
}

export type ViewerEventKind = 'join' | 'share' | 'leave';

export async function announceLiveRoomViewerEvent(args: {
  accessToken: string;
  roomId: string;
  kind: ViewerEventKind;
}): Promise<LiveRoomChatMessageRow> {
  const res = await fetchWebApiAuthed(
    `/api/live-rooms/${encodeURIComponent(args.roomId)}/viewer-event`,
    args.accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ kind: args.kind }),
    },
  );
  let j: { message?: LiveRoomChatMessageRow; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  if (!j.message?.id) throw new Error('Server did not return a viewer event.');
  return j.message;
}
