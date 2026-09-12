import { readAsStringAsync } from 'expo-file-system/legacy';
import {
  evaluateUsernamePolicy,
  normalizeUsernameForStorage,
  USERNAME_UNAVAILABLE_MESSAGE,
  usernamePolicyUserMessage,
} from '../lib/username-policy';
import { postJsonWithTimeout } from '../lib/postJsonWithTimeout';
import { prepareProfileAvatarForUpload, avatarUrlWithCacheBust } from '../lib/profileAvatarUpload';
import { getSupabase } from '../lib/supabase';
import type { ProfileLite } from '../types/tradeOffers';

/** Client-side rules; returns a user-facing message or null if OK. */
export function validateUsernameFormat(raw: string): string | null {
  const normalized = normalizeUsernameForStorage(raw);
  if (normalized.length < 3) return 'Use at least 3 characters.';
  if (normalized.length > 20) return 'Use at most 20 characters.';
  const policy = evaluateUsernamePolicy(normalized);
  if (!policy.ok) return usernamePolicyUserMessage(policy.reason);
  return null;
}

function isMissingUsernameRpc(e: { message?: string; code?: string } | null): boolean {
  if (!e?.message) return false;
  const m = e.message.toLowerCase();
  if (m.includes('could not find the function')) return true;
  if (e.code === 'PGRST202' || e.code === '42883') return true;
  return false;
}

function isSchemaPublicPermissionDenied(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes('permission denied') && m.includes('schema public');
}

const SCHEMA_PUBLIC_HINT =
  'Fix: run npm run db:push (migration 20260516000002), or set EXPO_PUBLIC_NETLIFY_FUNCTIONS_BASE and deploy Netlify (check-username-available). In Supabase: Settings → Data API → expose public schema.';

/**
 * When anon/Data API cannot use `public` (schema permission errors), the Netlify function
 * `check-username-available` uses the service role and returns the same shape.
 */
async function checkUsernameViaNetlify(
  handle: string,
): Promise<{ available: boolean; message?: string } | null> {
  const base = process.env.EXPO_PUBLIC_NETLIFY_FUNCTIONS_BASE?.trim().replace(/\/+$/, '');
  if (!base) return null;
  try {
    const url = `${base}/check-username-available?username=${encodeURIComponent(handle)}`;
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    let j: { available?: boolean; message?: string; error?: string };
    try {
      j = (await res.json()) as { available?: boolean; message?: string; error?: string };
    } catch {
      return null;
    }
    if (res.status === 400 && j.message) {
      return { available: false, message: j.message };
    }
    if (!res.ok) {
      if (__DEV__ && j.error) {
        console.warn('[checkUsernameViaNetlify]', res.status, j.error);
      }
      return null;
    }
    if (typeof j.available === 'boolean') {
      if (!j.available) {
        return { available: false, message: j.message ?? USERNAME_UNAVAILABLE_MESSAGE };
      }
      return { available: true };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Username availability: prefer Netlify (service role) when configured; else RPC + REST on Supabase.
 */
export async function checkUsernameAvailable(raw: string): Promise<{ available: boolean; message?: string }> {
  const formatErr = validateUsernameFormat(raw);
  if (formatErr) return { available: false, message: formatErr };
  const handle = raw.trim();

  const viaNetlify = await checkUsernameViaNetlify(handle);
  if (viaNetlify) return viaNetlify;

  const sb = getSupabase();
  if (!sb) return { available: false, message: 'Cannot reach the server right now.' };
  const canonical = handle.toLowerCase();

  const { data: rpcData, error: rpcError } = await sb.rpc('is_username_available', { p_candidate: handle });
  if (!rpcError && typeof rpcData === 'boolean') {
    if (!rpcData) return { available: false, message: USERNAME_UNAVAILABLE_MESSAGE };
    return { available: true };
  }

  if (rpcError && !isMissingUsernameRpc(rpcError)) {
    if (isSchemaPublicPermissionDenied(rpcError.message)) {
      return {
        available: false,
        message: __DEV__ ? `Could not verify username: ${rpcError.message} ${SCHEMA_PUBLIC_HINT}` : SCHEMA_PUBLIC_HINT,
      };
    }
    return {
      available: false,
      message: __DEV__
        ? `Could not verify username: ${rpcError.message}`
        : 'Could not verify username. Try again.',
    };
  }

  const { data: rows, error: rowError } = await sb.from('profiles').select('id').eq('username', canonical).limit(1);
  if (rowError) {
    if (isSchemaPublicPermissionDenied(rowError.message)) {
      return {
        available: false,
        message: __DEV__ ? `Could not verify username: ${rowError.message} ${SCHEMA_PUBLIC_HINT}` : SCHEMA_PUBLIC_HINT,
      };
    }
    return {
      available: false,
      message: __DEV__
        ? `Could not verify username: ${rowError.message}`
        : 'Could not verify username. Try again.',
    };
  }
  if (rows?.length) return { available: false, message: USERNAME_UNAVAILABLE_MESSAGE };

  return { available: true };
}

async function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function avatarUploadEndpoints(): string[] {
  const endpoints: string[] = [];
  const fnBase = process.env.EXPO_PUBLIC_NETLIFY_FUNCTIONS_BASE?.trim().replace(/\/+$/, '');
  if (fnBase) endpoints.push(`${fnBase}/upload-avatar`);
  const site = (process.env.EXPO_PUBLIC_WEB_API_URL || process.env.EXPO_PUBLIC_SITE_URL)?.trim().replace(/\/+$/, '');
  if (site) endpoints.push(`${site}/api/uploads/avatar`);
  return endpoints;
}

/**
 * Upload via JSON base64 + XMLHttpRequest timeout.
 * Prefers Netlify `upload-avatar` (service role), then Next `/api/uploads/avatar`.
 */
export async function uploadMyAvatar(userId: string, localUri: string, _mimeType?: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const authId = userId.trim();
  if (!authId) throw new Error('Sign in again to upload a profile photo.');

  const endpoints = avatarUploadEndpoints();
  if (!endpoints.length) {
    throw new Error('Upload host is not configured. Set EXPO_PUBLIC_SITE_URL.');
  }

  const { data: sessionData } = await withDeadline(sb.auth.getSession(), 8_000, 'session');
  const accessToken = sessionData.session?.access_token?.trim();
  if (!accessToken) throw new Error('Sign in again to upload a profile photo.');

  // Crop modal already prepares; only re-encode raw library URIs (seller setup).
  const needsPrepare = !/ImageManipulator|ImagePicker/i.test(localUri);
  const preparedUri = needsPrepare
    ? await withDeadline(prepareProfileAvatarForUpload(localUri), 15_000, 'photo prepare')
    : localUri;
  const base64 = await withDeadline(readAsStringAsync(preparedUri, { encoding: 'base64' }), 10_000, 'read photo');
  if (!base64?.trim()) throw new Error('Could not read photo data.');

  const body = JSON.stringify({ base64, contentType: 'image/jpeg' });
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-GV-Client': 'getvaulted-mobile',
  };

  let lastError = 'Upload failed.';
  for (const url of endpoints) {
    try {
      const res = await postJsonWithTimeout(url, headers, body, 40_000);
      let payload: { url?: string; error?: string } | null = null;
      try {
        payload = JSON.parse(res.text) as { url?: string; error?: string };
      } catch {
        payload = null;
      }
      if (res.status >= 200 && res.status < 300 && payload?.url?.trim()) {
        const busted = avatarUrlWithCacheBust(payload.url.trim());
        void sb
          .from('profiles')
          .update({ avatar_url: busted })
          .eq('id', authId)
          .then(({ error }) => {
            if (error) console.warn('[uploadMyAvatar] profiles update', error.message);
          });
        void sb.auth.updateUser({ data: { avatar_url: busted } }).then(({ error }) => {
          if (error) console.warn('[uploadMyAvatar] auth metadata', error.message);
        });
        return busted;
      }
      lastError = payload?.error?.trim() || `Upload failed (${res.status}).`;
      // Auth errors won't succeed on the fallback host either.
      if (res.status === 401 || res.status === 403) break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Upload failed.';
    }
  }

  throw new Error(lastError);
}

export async function fetchProfileIdByUsername(raw: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const canonical = normalizeUsernameForStorage(raw.trim());
  if (!canonical) return null;
  const { data, error } = await sb.from('profiles').select('id').eq('username', canonical).maybeSingle();
  if (error || !data?.id) return null;
  return data.id;
}

export async function fetchProfileById(userId: string): Promise<ProfileLite | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('profiles').select('id, username, display_name, avatar_url').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return data as ProfileLite;
}

/** Batch-resolve usernames for mod tools (presence often tracks placeholder "Member"). */
export async function fetchProfileUsernamesByIds(userIds: string[]): Promise<Record<string, string>> {
  const sb = getSupabase();
  if (!sb) return {};
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await sb.from('profiles').select('id, username, display_name').in('id', ids);
  if (error || !data?.length) return {};

  const out: Record<string, string> = {};
  for (const row of data) {
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const username = typeof row.username === 'string' ? row.username.trim() : '';
    const displayName = typeof row.display_name === 'string' ? row.display_name.trim() : '';
    const label = username || displayName;
    if (id && label) out[id] = label.replace(/^@/, '');
  }
  return out;
}

export async function updateMyProfile(
  userId: string,
  patch: { username?: string; display_name?: string; avatar_url?: string | null },
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  if (patch.username !== undefined) {
    const formatErr = validateUsernameFormat(patch.username);
    if (formatErr) throw new Error(formatErr);
    const availability = await checkUsernameAvailable(patch.username);
    if (!availability.available) {
      throw new Error(availability.message ?? USERNAME_UNAVAILABLE_MESSAGE);
    }
    patch = { ...patch, username: normalizeUsernameForStorage(patch.username) };
  }
  const { error } = await sb.from('profiles').update(patch).eq('id', userId);
  if (error) throw new Error(error.message);
}
