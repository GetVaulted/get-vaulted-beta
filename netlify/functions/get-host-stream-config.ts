import type { Handler } from '@netlify/functions';
import { readSupabaseEnv, requireSupabaseService } from './_lib/env';
import { createSupabaseService, getUserFromAuthHeader } from './_lib/supabase';

/**
 * Host-only: returns ingest endpoint + stream key ARN + playback URL.
 * Never returns raw stream key from DB (not stored). Rotate/recreate in IVS if key was lost.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sb = readSupabaseEnv();
  const auth = await getUserFromAuthHeader(sb.url, sb.anonKey, event.headers.authorization);
  if ('error' in auth) {
    return { statusCode: auth.status, body: auth.error };
  }

  const svc = requireSupabaseService();
  if ('error' in svc) {
    return { statusCode: 500, body: svc.error };
  }

  let body: { show_id: string };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }
  if (!body.show_id) {
    return { statusCode: 400, body: 'show_id required' };
  }

  const admin = createSupabaseService(svc.url, svc.serviceKey);
  const { data: show, error } = await admin.from('live_shows').select('id, host_id, ivs_playback_url').eq('id', body.show_id).single();
  if (error || !show) {
    return { statusCode: 404, body: 'Show not found' };
  }
  if (show.host_id !== auth.user.id) {
    return { statusCode: 403, body: 'Only the show host can load stream config' };
  }

  const { data: sec } = await admin.from('live_show_stream_secrets').select('*').eq('show_id', show.id).maybeSingle();

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      show_id: show.id,
      playback_url: show.ivs_playback_url,
      ingest_endpoint: sec?.ivs_ingest_endpoint ?? null,
      stream_key_arn: sec?.ivs_stream_key_arn ?? null,
      secret_reference: sec?.stream_key_secret_reference ?? null,
      note: 'IVS stream key value is only available at channel creation. Use AWS Secrets Manager + reference for rotation (TODO).',
    }),
  };
};
