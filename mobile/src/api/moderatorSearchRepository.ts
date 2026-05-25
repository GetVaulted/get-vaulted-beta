import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';

export type ModeratorSearchUser = {
  id: string;
  username: string;
  email: string;
};

export async function searchModeratorUsers(
  accessToken: string,
  query: string,
): Promise<ModeratorSearchUser[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const base = getWebApiBaseUrl();
  if (!base) return [];
  const res = await fetch(`${base}/api/seller/moderator-search?q=${encodeURIComponent(q)}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const j = (await res.json().catch(() => ({}))) as { users?: ModeratorSearchUser[] };
  return Array.isArray(j.users) ? j.users : [];
}
