import {
  evaluateUsernamePolicy,
  normalizeUsernameForStorage,
  USERNAME_UNAVAILABLE_MESSAGE,
  usernamePolicyUserMessage,
} from '../lib/username-policy';
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
      message: __DEV__ ? `Could not verify username: ${rowError.message}` : 'Could not verify username. Try again.',
    };
  }
  if (rows && rows.length > 0) {
    return { available: false, message: USERNAME_UNAVAILABLE_MESSAGE };
  }

  return { available: true };
}

/**
 * Upload a circle-cropped JPEG to Storage `avatars/{userId}/avatar.jpg` and return the public URL.
 */
export async function uploadMyAvatar(userId: string, localUri: string, _mimeType?: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const preparedUri = await prepareProfileAvatarForUpload(localUri);
  const path = `${userId}/avatar.jpg`;
  const response = await fetch(preparedUri);
  const body = await response.arrayBuffer();
  const { error: upErr } = await sb.storage.from('avatars').upload(path, body, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upErr) throw new Error(upErr.message);
  const { data } = sb.storage.from('avatars').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Could not resolve avatar URL');
  return avatarUrlWithCacheBust(data.publicUrl);
}

export async function fetchProfileById(userId: string): Promise<ProfileLite | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('profiles').select('id, username, display_name, avatar_url').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return data as ProfileLite;
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
