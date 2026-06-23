import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';

export type MentionSearchUser = {
  id: string;
  username: string;
  image: string | null;
};

export async function searchMentionUsers(accessToken: string, query: string): Promise<MentionSearchUser[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const res = await fetchWebApiMobile(`/api/users/mention-search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let j: { users?: MentionSearchUser[] } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) return [];
  return Array.isArray(j.users) ? j.users : [];
}

export async function searchLiveRoomMentionUsers(
  accessToken: string,
  liveRoomId: string,
  query: string,
): Promise<MentionSearchUser[]> {
  const res = await fetchWebApiMobile(
    `/api/live-rooms/${encodeURIComponent(liveRoomId)}/mention-search?q=${encodeURIComponent(query.trim())}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  let j: { users?: MentionSearchUser[] } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) return [];
  return Array.isArray(j.users) ? j.users : [];
}
