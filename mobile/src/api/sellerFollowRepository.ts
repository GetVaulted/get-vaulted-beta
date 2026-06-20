import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';
import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';

export type SellerFollowStatus = {
  following: boolean;
  followerCount: number;
  isSelf: boolean;
};

export type AccountFollowUser = {
  userId: string;
  username: string;
  image: string | null;
  followedAt: string;
};

export type AccountFollows = {
  following: AccountFollowUser[];
  followers: AccountFollowUser[];
};

function sellerFollowPath(sellerUserId: string): string {
  return `/api/sellers/${encodeURIComponent(sellerUserId)}`;
}

export async function fetchSellerFollowStatus(
  sellerUserId: string,
  accessToken?: string,
): Promise<SellerFollowStatus | null> {
  const path = `${sellerFollowPath(sellerUserId)}/follow-status`;
  const res = accessToken
    ? await fetchWebApiAuthed(path, accessToken, { method: 'GET' })
    : await fetchWebApiMobile(path, { method: 'GET' });
  if (!res.ok) return null;
  try {
    return (await res.json()) as SellerFollowStatus;
  } catch {
    return null;
  }
}

export async function setSellerFollow(
  sellerUserId: string,
  follow: boolean,
  accessToken: string,
): Promise<{ ok: boolean; following: boolean; error?: string }> {
  const path = `${sellerFollowPath(sellerUserId)}/follow`;
  const res = await fetchWebApiAuthed(path, accessToken, {
    method: follow ? 'POST' : 'DELETE',
  });
  let body: { following?: boolean; error?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* ignore */
  }
  if (!res.ok && res.status !== 409) {
    return {
      ok: false,
      following: !follow,
      error: typeof body.error === 'string' ? body.error : `Request failed (${res.status})`,
    };
  }
  return { ok: true, following: follow };
}

export async function toggleSellerFollow(
  sellerUserId: string,
  currentlyFollowing: boolean,
  accessToken: string,
): Promise<{ following: boolean; followerCount?: number; error?: string }> {
  const result = await setSellerFollow(sellerUserId, !currentlyFollowing, accessToken);
  if (!result.ok) {
    return { following: currentlyFollowing, error: result.error };
  }
  const status = await fetchSellerFollowStatus(sellerUserId, accessToken);
  return {
    following: result.following,
    followerCount: status?.followerCount,
  };
}

export async function fetchAccountFollows(accessToken: string): Promise<AccountFollows | null> {
  const res = await fetchWebApiAuthed('/api/account/follows', accessToken, { method: 'GET' });
  if (!res.ok) return null;
  try {
    const j = (await res.json()) as Partial<AccountFollows>;
    return {
      following: Array.isArray(j.following) ? j.following : [],
      followers: Array.isArray(j.followers) ? j.followers : [],
    };
  } catch {
    return null;
  }
}
