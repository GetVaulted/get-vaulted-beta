import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';

export type PeopleSearchUser = {
  id: string;
  username: string;
  image: string | null;
  following: boolean;
  followerCount: number;
  isSelf: boolean;
};

/** Username people search for follow discovery (web `/api/users/people-search`). */
export async function searchPeopleUsers(
  accessToken: string | null | undefined,
  query: string,
): Promise<PeopleSearchUser[]> {
  const q = query.trim().replace(/^@+/, '');
  if (q.length < 1) return [];
  const headers: Record<string, string> = {};
  if (accessToken?.trim()) {
    headers.Authorization = `Bearer ${accessToken.trim()}`;
  }
  const res = await fetchWebApiMobile(`/api/users/people-search?q=${encodeURIComponent(q)}`, {
    headers,
  });
  let j: { users?: PeopleSearchUser[] } = {};
  try {
    j = (await res.json()) as typeof j;
  } catch {
    /* ignore */
  }
  if (!res.ok) return [];
  return Array.isArray(j.users) ? j.users : [];
}
