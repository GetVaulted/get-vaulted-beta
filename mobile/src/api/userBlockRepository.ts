import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';

export type BlockedUserRow = {
  userId: string;
  username: string | null;
  image: string | null;
  blockedAt: string;
};

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchBlockedUsers(accessToken: string): Promise<BlockedUserRow[]> {
  const res = await fetchWebApiMobile('/api/account/blocks', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not load blocked users.');
  }
  const data = (await res.json()) as { blocked?: BlockedUserRow[] };
  return Array.isArray(data.blocked) ? data.blocked : [];
}

export async function setUserBlockedRemote(
  accessToken: string,
  userId: string,
  blocked: boolean,
): Promise<void> {
  if (blocked) {
    const res = await fetchWebApiMobile('/api/account/blocks', {
      method: 'POST',
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, blocked: true }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? 'Could not block user.');
    }
    return;
  }

  const res = await fetchWebApiMobile(`/api/account/blocks/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not unblock user.');
  }
}
