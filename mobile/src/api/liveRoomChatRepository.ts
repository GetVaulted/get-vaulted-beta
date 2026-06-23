import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';

export type LiveRoomChatMessageType = 'chat' | 'bid' | 'purchase' | 'system';

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

export async function fetchLiveRoomChatMessages(roomId: string): Promise<LiveRoomChatMessageRow[]> {
  const res = await fetchWebApiMobile(`/api/live-rooms/${encodeURIComponent(roomId)}/messages`);
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
}): Promise<LiveRoomChatMessageRow> {
  const payload: { body: string; clientMessageId?: string } = { body: args.body.trim() };
  if (args.clientMessageId?.trim()) payload.clientMessageId = args.clientMessageId.trim();
  const res = await fetchWebApiMobile(`/api/live-rooms/${encodeURIComponent(args.roomId)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.accessToken}`,
    },
    body: JSON.stringify(payload),
  });
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
  const res = await fetchWebApiMobile(`/api/live-rooms/${encodeURIComponent(args.roomId)}/viewer-event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.accessToken}`,
    },
    body: JSON.stringify({ kind: args.kind }),
  });
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
