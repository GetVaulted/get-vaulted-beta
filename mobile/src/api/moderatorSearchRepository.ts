import { fetchWebApiMobileWithSellerAuth } from '../lib/resolveSellerAccessToken';

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
  const res = await fetchWebApiMobileWithSellerAuth(
    `/api/seller/moderator-search?q=${encodeURIComponent(q)}`,
    accessToken,
    { method: 'GET', headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return [];
  const j = (await res.json().catch(() => ({}))) as { users?: ModeratorSearchUser[] };
  return Array.isArray(j.users) ? j.users : [];
}
