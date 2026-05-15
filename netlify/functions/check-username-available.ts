import type { Handler } from '@netlify/functions';
import { requireSupabaseService } from './_lib/env';
import { createSupabaseService } from './_lib/supabase';

/** Keep in sync with mobile `validateUsernameFormat` / `profilesRepository.ts`. */
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const RESERVED = new Set([
  'admin',
  'administrator',
  'getvaulted',
  'get_vaulted',
  'support',
  'help',
  'system',
  'official',
  'staff',
  'moderator',
  'mod',
  'null',
  'undefined',
]);

function validateUsername(raw: string): string | null {
  const t = raw.trim();
  if (t.length < 3) return 'Use at least 3 characters.';
  if (t.length > 20) return 'Use at most 20 characters.';
  if (!USERNAME_RE.test(t)) return 'Use letters, numbers, and underscores only.';
  if (RESERVED.has(t.toLowerCase())) return 'That username is reserved.';
  return null;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const raw = event.queryStringParameters?.username?.trim() ?? '';
  const verr = validateUsername(raw);
  if (verr) {
    return {
      statusCode: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: false, message: verr }),
    };
  }

  const svc = requireSupabaseService();
  if ('error' in svc) {
    return {
      statusCode: 503,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: svc.error }),
    };
  }

  const admin = createSupabaseService(svc.url, svc.serviceKey);

  const { data: viaRpc, error: rpcErr } = await admin.rpc('is_username_available', { p_candidate: raw });
  if (!rpcErr && typeof viaRpc === 'boolean') {
    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: viaRpc }),
    };
  }

  const canonical = raw.toLowerCase();
  const { data: rows, error: rowErr } = await admin.from('profiles').select('id').eq('username', canonical).limit(1);
  if (rowErr) {
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: rowErr.message }),
    };
  }

  const taken = Array.isArray(rows) && rows.length > 0;
  return {
    statusCode: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
    body: JSON.stringify({ available: !taken }),
  };
};
