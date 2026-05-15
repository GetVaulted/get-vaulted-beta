import type { Handler } from '@netlify/functions';
import { readShippoEnv, readSupabaseEnv, requireSupabaseService } from './_lib/env';
import { createSupabaseService } from './_lib/supabase';

/**
 * Shippo tracking / transaction webhooks.
 * TODO: verify official Shippo signature scheme for your webhook version (HMAC / token).
 * MVP: optional SHIPPO_WEBHOOK_SECRET header check + persist status via service role.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secret = readShippoEnv().shippoWebhookSecret;
  const provided = event.headers['x-shippo-webhook-secret'] ?? event.headers['X-Shippo-Webhook-Secret'];
  if (secret && provided !== secret) {
    return { statusCode: 401, body: 'Invalid webhook secret' };
  }

  const svc = requireSupabaseService();
  if ('error' in svc) {
    return { statusCode: 500, body: svc.error };
  }

  let payload: { event?: string; data?: { object_id?: string; tracking_status?: string; transaction?: { object_id?: string } } };
  try {
    payload = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : (event.body ?? '{}'));
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const admin = createSupabaseService(svc.url, svc.serviceKey);
  const txId = payload.data?.transaction?.object_id ?? payload.data?.object_id;

  if (txId) {
    const statusMap: Record<string, string> = {
      DELIVERED: 'delivered',
      TRANSIT: 'in_transit',
      PRE_TRANSIT: 'purchased',
      FAILURE: 'error',
    };
    const raw = payload.data?.tracking_status ?? payload.event;
    const next = raw ? statusMap[raw] ?? 'in_transit' : null;
    if (next) {
      await admin.from('shipping_labels').update({ status: next }).eq('shippo_transaction_id', txId);
    }
  }

  void readSupabaseEnv;

  return { statusCode: 200, body: JSON.stringify({ received: true, todo: 'Harden mapping to Shippo event payloads.' }) };
};
