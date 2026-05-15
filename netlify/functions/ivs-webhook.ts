import type { Handler } from '@netlify/functions';
import { readSupabaseEnv, requireSupabaseService } from './_lib/env';
import { createSupabaseService } from './_lib/supabase';

/**
 * AWS IVS / EventBridge → HTTPS webhook (placeholder).
 * TODO: verify SigV4 or shared secret from EventBridge rule target; update stream_health_status on events.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const svc = requireSupabaseService();
  if ('error' in svc) {
    return { statusCode: 500, body: svc.error };
  }

  void readSupabaseEnv;
  void createSupabaseService(svc.url, svc.serviceKey);

  return {
    statusCode: 202,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      received: true,
      todo: 'Wire EventBridge → this URL; verify AWS signature; map IVS state change events to live_shows.stream_health_status.',
    }),
  };
};
