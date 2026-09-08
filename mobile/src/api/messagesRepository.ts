import { readAsStringAsync } from 'expo-file-system/legacy';
import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
import type {
  MessageConversationKind,
  MessageThreadView,
  ThreadDetail,
  ThreadListItem,
  ThreadMessage,
} from '../types/messages';

function apiErrorMessage(res: Response, body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: string }).error;
    if (typeof err === 'string' && err.trim()) return err.trim();
  }
  return `Request failed (${res.status})`;
}

async function msgFetch(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (init?.body) headers['Content-Type'] = 'application/json';
  if (init?.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((value, key) => {
      headers[key] = value;
    });
  }
  return fetchWebApiMobile(path, {
    ...init,
    headers,
  });
}

export async function fetchMessageThreads(
  accessToken: string,
  inbox: MessageThreadView = 'primary',
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
  imageUrl?: string,
): Promise<ThreadMessage> {
  const res = await msgFetch(`/api/account/threads/${encodeURIComponent(threadId)}`, accessToken, {
    method: 'POST',
    body: JSON.stringify(imageUrl ? { body, imageUrl } : { body }),
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

/**
 * Upload a DM photo → `/api/uploads/message-image`. JSON base64, not multipart — RN FormData
 * uploads hang and do not abort reliably (same lesson as the avatar upload path).
 */
export async function uploadThreadImage(accessToken: string, localUri: string): Promise<string> {
  const base64 = await readAsStringAsync(localUri, { encoding: 'base64' });
  if (!base64?.trim()) throw new Error('Could not read photo data.');

  const res = await msgFetch('/api/uploads/message-image', accessToken, {
    method: 'POST',
    body: JSON.stringify({ base64, contentType: 'image/jpeg' }),
  });
  let j: { url?: string; error?: string } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok || !j.url?.trim()) throw new Error(apiErrorMessage(res, j));
  return j.url.trim();
}

export type StartConversationParams = {
  listingId?: string;
  liveRoomId?: string;
  sellerUserId?: string;
  recipientUserId?: string;
  offerId?: string;
  orderId?: string;
  conversationKind?: MessageConversationKind;
  body: string;
  imageUrl?: string;
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

export type ThreadAction = 'accept_request' | 'pin' | 'star' | 'mute' | 'block' | 'delete' | 'restore';

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
