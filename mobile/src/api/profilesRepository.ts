import {
  evaluateUsernamePolicy,
  normalizeUsernameForStorage,
  USERNAME_UNAVAILABLE_MESSAGE,
  usernamePolicyUserMessage,
} from '../lib/username-policy';
import { prepareProfileAvatarForUpload, avatarUrlWithCacheBust } from '../lib/profileAvatarUpload';
import { fetchWebApiMobile } from '../lib/fetchWebApiMobile';
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
      message: __DEV__ ? `Could not verify username: ${rowError.message}` : 'Could not verify username. Try again.',
    };
  }
  if (rows && rows.length > 0) {
    return { available: false, message: USERNAME_UNAVAILABLE_MESSAGE };
  }

  return { available: true };
}

/**
 * Upload a circle-cropped JPEG via Next.js `/api/uploads/avatar` (service role → `avatars` bucket).
 * Avoids client-side Storage RLS failures during seller onboarding / profile edit.
 */
export async function uploadMyAvatar(userId: string, localUri: string, _mimeType?: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { data: sessionData } = await sb.auth.getSession();
  const accessToken = sessionData.session?.access_token?.trim();
  if (!accessToken) throw new Error('Sign in again to upload a profile photo.');

  const preparedUri = await prepareProfileAvatarForUpload(localUri);
  const form = new FormData();
  form.append('file', {
    uri: preparedUri,
    name: 'avatar.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);

  // RN multipart aborts are unreliable — race a hard deadline so callers never spin forever.
  const UPLOAD_DEADLINE_MS = 25_000;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const res = await Promise.race([
    fetchWebApiMobile('/api/uploads/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }),
    new Promise<never>((_, reject) => {
      deadlineTimer = setTimeout(
        () => reject(new Error('Photo upload timed out. Check your connection and try again.')),
        UPLOAD_DEADLINE_MS,
      );
    }),
  ]).finally(() => {
    if (deadlineTimer) clearTimeout(deadlineTimer);
  });
  const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok) {
    throw new Error(body?.error?.trim() || `Could not upload photo (${res.status}).`);
  }
  const url = body?.url?.trim();
  if (!url) throw new Error('Could not resolve avatar URL');
  void userId;
  return avatarUrlWithCacheBust(url);
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
