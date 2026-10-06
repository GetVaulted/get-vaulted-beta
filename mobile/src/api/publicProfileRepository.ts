import { readAsStringAsync } from 'expo-file-system/legacy';
import { fetchWebApiAuthed } from '../lib/fetchWebApiAuthed';
import { postJsonWithTimeout } from '../lib/postJsonWithTimeout';
import { prepareProfileBannerForUpload } from '../lib/profileAvatarUpload';
import type { ProfileLinkKey } from '../lib/sellerProfileView';

export type MyPublicProfile = {
  username: string;
  bio: string | null;
  bannerUrl: string | null;
  links: Partial<Record<ProfileLinkKey, string>>;
};

export type SaveMyPublicProfileInput = {
  /** Blank or null clears the bio. */
  bio: string | null;
  bannerUrl: string | null;
  /** Handles or full links; blanks are dropped by the server. */
  links: Partial<Record<ProfileLinkKey, string>>;
};

type ProfileBody = {
  error?: string;
  user?: {
    username?: string;
    bio?: string | null;
    bannerUrl?: string | null;
    links?: Partial<Record<ProfileLinkKey, string>>;
  };
};

function toMine(body: ProfileBody): MyPublicProfile | null {
  const u = body.user;
  if (!u) return null;
  return {
    username: u.username ?? '',
    bio: u.bio ?? null,
    bannerUrl: u.bannerUrl?.trim() || null,
    links: u.links ?? {},
  };
}

export async function fetchMyPublicProfile(accessToken: string): Promise<MyPublicProfile | null> {
  const res = await fetchWebApiAuthed('/api/account/profile', accessToken, { method: 'GET' });
  if (!res.ok) return null;
  return toMine((await res.json().catch(() => ({}))) as ProfileBody);
}

/** Saves bio, banner and links. Throws the server's message (e.g. "Instagram link is not valid."). */
export async function saveMyPublicProfile(
  accessToken: string,
  input: SaveMyPublicProfileInput,
): Promise<MyPublicProfile> {
  const res = await fetchWebApiAuthed('/api/account/profile', accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bio: input.bio?.trim() ? input.bio : null,
      bannerUrl: input.bannerUrl,
      links: input.links,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as ProfileBody;
  const mine = res.ok ? toMine(body) : null;
  if (!mine) throw new Error(body.error?.trim() || 'Could not save your profile.');
  return mine;
}

function siteBase(): string | null {
  const site = (process.env.EXPO_PUBLIC_WEB_API_URL || process.env.EXPO_PUBLIC_SITE_URL)?.trim().replace(/\/+$/, '');
  return site || null;
}

/** Uploads a banner photo and returns its public URL (save it with `saveMyPublicProfile`). */
export async function uploadMyBanner(accessToken: string, localUri: string): Promise<string> {
  const base = siteBase();
  if (!base) throw new Error('Upload host is not configured. Set EXPO_PUBLIC_SITE_URL.');
  const prepared = await prepareProfileBannerForUpload(localUri);
  const base64 = await readAsStringAsync(prepared, { encoding: 'base64' });
  if (!base64?.trim()) throw new Error('Could not read photo data.');

  const res = await postJsonWithTimeout(
    `${base}/api/uploads/avatar?kind=banner`,
    {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-GV-Client': 'getvaulted-mobile',
    },
    JSON.stringify({ base64, contentType: 'image/jpeg' }),
    40_000,
  );
  let payload: { url?: string; error?: string } | null = null;
  try {
    payload = JSON.parse(res.text) as { url?: string; error?: string };
  } catch {
    payload = null;
  }
  if (res.status >= 200 && res.status < 300 && payload?.url?.trim()) return payload.url.trim();
  throw new Error(payload?.error?.trim() || `Upload failed (${res.status}).`);
}
