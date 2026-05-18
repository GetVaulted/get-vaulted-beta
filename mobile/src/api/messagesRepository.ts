import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import type { MessageConversationKind, ThreadDetail, ThreadListItem, ThreadMessage } from '../types/messages';

function apiErrorMessage(res: Response, body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: string }).error;
    if (typeof err === 'string' && err.trim()) return err.trim();
  }
  return `Request failed (${res.status})`;
}

async function msgFetch(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const base = getWebApiBaseUrl();
  if (!base) {
    throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  }
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
}

export async function fetchMessageThreads(
  accessToken: string,
  inbox: 'primary' | 'request' = 'primary',
): Promise<{ threads: ThreadListItem[]; requestCount: number }> {
  const res = await msgFetch(`/api/account/threads?inbox=${inbox}`, accessToken);
  let j: { threads?: ThreadListItem[]; requestCount?: number; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  return {
    threads: Array.isArray(j.threads) ? j.threads : [],
    requestCount: typeof j.requestCount === 'number' ? j.requestCount : 0,
  };
}

export async function fetchMessageThread(
  accessToken: string,
  threadId: string,
): Promise<{ thread: ThreadDetail; messages: ThreadMessage[] }> {
  const res = await msgFetch(`/api/account/threads/${encodeURIComponent(threadId)}`, accessToken);
  let j: { thread?: ThreadDetail; messages?: ThreadMessage[]; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  if (!j.thread?.id) throw new Error('Thread not found.');
  return { thread: j.thread, messages: Array.isArray(j.messages) ? j.messages : [] };
}

export async function sendThreadMessage(
  accessToken: string,
  threadId: string,
  body: string,
): Promise<ThreadMessage> {
  const res = await msgFetch(`/api/account/threads/${encodeURIComponent(threadId)}`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  let j: { message?: ThreadMessage; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  if (!j.message?.id) throw new Error('Message not sent.');
  return j.message;
}

export type StartConversationParams = {
  listingId?: string;
  liveRoomId?: string;
  offerId?: string;
  orderId?: string;
  conversationKind?: MessageConversationKind;
  body: string;
};

export async function startConversation(
  accessToken: string,
  params: StartConversationParams,
): Promise<{ threadId: string; inbox: 'primary' | 'request' }> {
  const res = await msgFetch('/api/messages', accessToken, {
    method: 'POST',
    body: JSON.stringify(params),
  });
  let j: { threadId?: string; inbox?: 'primary' | 'request'; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
  if (!j.threadId) throw new Error('Could not start conversation.');
  return { threadId: j.threadId, inbox: j.inbox ?? 'primary' };
}

export type ThreadAction = 'accept_request' | 'pin' | 'star' | 'mute' | 'block';

export async function patchThreadAction(
  accessToken: string,
  threadId: string,
  action: ThreadAction,
  value?: boolean,
): Promise<void> {
  const res = await msgFetch(`/api/account/threads/${encodeURIComponent(threadId)}/actions`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({ action, value }),
  });
  let j: { error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, j));
}
