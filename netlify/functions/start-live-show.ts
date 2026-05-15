import type { Handler } from '@netlify/functions';
import { readSupabaseEnv, requireSupabaseService } from './_lib/env';
import { createSupabaseService, getUserFromAuthHeader } from './_lib/supabase';

/** Host-only: marks show live + stream_started_at; RTMP ingest is handled by IVS + OBS encoder. */
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
  const { data: show, error } = await admin.from('live_shows').select('id, host_id, ivs_channel_arn').eq('id', body.show_id).single();
  if (error || !show) {
    return { statusCode: 404, body: 'Show not found' };
  }
  if (show.host_id !== auth.user.id) {
    return { statusCode: 403, body: 'Only the host can start the stream' };
  }
  if (!show.ivs_channel_arn) {
    return { statusCode: 400, body: 'Create IVS channel first' };
  }

  const now = new Date().toISOString();
  await admin
    .from('live_shows')
    .update({
      status: 'live',
      actual_start: now,
      stream_started_at: now,
      stream_health_status: 'healthy',
    })
    .eq('id', show.id);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      show_id: show.id,
      status: 'live',
      stream_health_status: 'healthy',
      todo: 'Subscribe to IVS health via EventBridge → ivs-webhook for degraded/offline.',
    }),
  };
};
