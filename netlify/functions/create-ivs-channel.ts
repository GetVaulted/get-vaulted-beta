import type { Handler } from '@netlify/functions';
import { readSupabaseEnv, requireAwsIvsCreds, requireSupabaseService } from './_lib/env';
import { ivsCreateChannel, ivsCreateStreamKey, createIvsClient } from './_lib/ivs';
import { createSupabaseService, getUserFromAuthHeader } from './_lib/supabase';

/**
 * Host-only: creates AWS IVS channel + stream key, persists ARNs/URLs to Supabase.
 * Raw stream key value is returned ONCE in this response — never stored in Postgres.
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

  const aws = requireAwsIvsCreds();
  if ('error' in aws) {
    return { statusCode: 503, body: JSON.stringify({ error: aws.error }) };
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
  const { data: show, error } = await admin.from('live_shows').select('id, host_id, title').eq('id', body.show_id).single();
  if (error || !show) {
    return { statusCode: 404, body: 'Show not found' };
  }
  if (show.host_id !== auth.user.id) {
    return { statusCode: 403, body: 'Only the show host can create an IVS channel' };
  }

  const { client } = createIvsClient(aws.region, aws.accessKeyId, aws.secretAccessKey);
  const channel = await ivsCreateChannel(client, `gv-${show.id}`, aws.defaultLatencyMode, aws.defaultChannelType);
  if (!channel.channel?.arn || !channel.channel?.playbackUrl) {
    return { statusCode: 502, body: 'IVS CreateChannel missing arn/playbackUrl' };
  }

  const streamKey = await ivsCreateStreamKey(client, channel.channel.arn);
  const ingest = channel.channel.ingestEndpoint ?? '';
  const keyArn = streamKey.streamKey?.arn ?? '';
  const keyValue = streamKey.streamKey?.value ?? '';

  await admin
    .from('live_shows')
    .update({
      ivs_channel_arn: channel.channel.arn,
      ivs_playback_url: channel.channel.playbackUrl,
      ivs_stage_arn: null,
    })
    .eq('id', show.id);

  await admin.from('live_show_stream_secrets').upsert(
    {
      show_id: show.id,
      host_id: auth.user.id,
      ivs_ingest_endpoint: ingest,
      ivs_stream_key_arn: keyArn,
      stream_key_secret_reference: 'returned-once-to-host-not-persisted',
    },
    { onConflict: 'show_id' },
  );

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      show_id: show.id,
      channel_arn: channel.channel.arn,
      playback_url: channel.channel.playbackUrl,
      ingest_endpoint: ingest,
      stream_key_arn: keyArn,
      /** Deliver to host app over TLS only; rotate key in IVS if lost. */
      stream_key_value: keyValue,
      warning: 'Store stream_key_value in secure device storage — do not log or broadcast.',
    }),
  };
};
