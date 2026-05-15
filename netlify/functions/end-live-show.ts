import type { Handler } from '@netlify/functions';
import { readSupabaseEnv, requireAwsIvsCreds, requireSupabaseService } from './_lib/env';
import { createIvsClient, ivsStopStream } from './_lib/ivs';
import { createSupabaseService, getUserFromAuthHeader } from './_lib/supabase';

/** Host-only: stops IVS stream (if active) and marks show ended. */
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
    return { statusCode: 403, body: 'Only the host can end the stream' };
  }

  const aws = requireAwsIvsCreds();
  if (!('error' in aws) && show.ivs_channel_arn) {
    try {
      const { client } = createIvsClient(aws.region, aws.accessKeyId, aws.secretAccessKey);
      await ivsStopStream(client, show.ivs_channel_arn);
    } catch {
      // TODO: map IVS errors (no active stream, etc.)
    }
  }

  const now = new Date().toISOString();
  await admin
    .from('live_shows')
    .update({
      status: 'ended',
      actual_end: now,
      stream_ended_at: now,
      stream_health_status: 'offline',
    })
    .eq('id', show.id);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ show_id: show.id, status: 'ended' }),
  };
};
