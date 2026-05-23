import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

export type LiveRoomChatMessageRow = {
  id: string;
  senderUsername: string;
  body: string;
  createdAt: string;
};

function apiErrorMessage(res: Response, body: unknown): string {
  if (body && typeof body === 'object') {
    const o = body as { error?: string };
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
  }
  return `Request failed (${res.status})`;
}

export async function fetchLiveRoomChatMessages(roomId: string): Promise<LiveRoomChatMessageRow[]> {
  const base = getWebApiBaseUrl();
  if (!base) throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  const res = await fetch(`${base}/api/live-rooms/${encodeURIComponent(roomId)}/messages`, {
    headers: { Accept: 'application/json' },
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
}): Promise<LiveRoomChatMessageRow> {
  const base = getWebApiBaseUrl();
  if (!base) throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  const res = await fetch(`${base}/api/live-rooms/${encodeURIComponent(args.roomId)}/messages`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.accessToken}`,
    },
    body: JSON.stringify({ body: args.body.trim() }),
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
