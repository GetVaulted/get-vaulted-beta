import { getWebApiBaseUrl } from './webApiBaseUrl';

/** Mobile → Next.js API fetch with the same headers as POST /api/live-rooms. */
export async function fetchWebApiMobile(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getWebApiBaseUrl();
  if (!base) {
    throw new Error('Set EXPO_PUBLIC_SITE_URL or EXPO_PUBLIC_WEB_API_URL to your Next.js API host.');
  }
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  headers.set('X-GV-Client', 'getvaulted-mobile');
  if (!headers.has('User-Agent')) headers.set('User-Agent', 'GetVaultedMobile/1.0 (Expo)');

  const basic = process.env.EXPO_PUBLIC_BETA_HTTP_BASIC?.trim();
  const normalizedBasic = basic ? (basic.startsWith('Basic ') ? basic : `Basic ${basic}`) : null;
  const authHeader = headers.get('Authorization')?.trim() ?? '';

  // Password-protected beta deploys need Basic on `Authorization`. Signed-in calls also need
  // Supabase Bearer — move it to X-GV-Supabase-Auth so both gates succeed.
  if (normalizedBasic && authHeader.startsWith('Bearer ')) {
    headers.set('X-GV-Supabase-Auth', authHeader);
    headers.set('Authorization', normalizedBasic);
  } else if (normalizedBasic && !authHeader) {
    headers.set('Authorization', normalizedBasic);
  }

  try {
    return await fetch(url, { ...init, headers, cache: 'no-store' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      msg.includes('Network request failed') || e instanceof TypeError
        ? `Could not reach the Vaulted API at ${base}. Check your connection and env.`
        : msg,
    );
  }
}
