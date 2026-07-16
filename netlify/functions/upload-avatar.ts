import type { Handler } from '@netlify/functions';
import { readSupabaseEnv, requireSupabaseService } from './_lib/env';
import { createSupabaseService, getUserFromAuthHeader } from './_lib/supabase';

const AVATARS_BUCKET = 'avatars';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, Authorization, X-GV-Client, X-GV-Supabase-Auth',
};

function bearerFromEvent(event: { headers: Record<string, string | undefined> }): string | undefined {
  const headers = Object.fromEntries(
    Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const mobile = headers['x-gv-supabase-auth']?.trim();
  if (mobile?.startsWith('Bearer ')) return mobile;
  const auth = headers.authorization?.trim();
  if (auth?.startsWith('Bearer ')) return auth;
  return undefined;
}

function magicMatches(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === 'image/png') {
    return (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    );
  }
  if (mime === 'image/webp') {
    return buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
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

  const env = readSupabaseEnv();
  const auth = await getUserFromAuthHeader(svc.url, env.anonKey, bearerFromEvent(event));
  if ('error' in auth) {
    return {
      statusCode: auth.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: auth.error }),
    };
  }

  let parsed: { base64?: string; contentType?: string };
  try {
    parsed = JSON.parse(event.body || '{}') as { base64?: string; contentType?: string };
  } catch {
    return {
      statusCode: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body.' }),
    };
  }

  const rawBase64 = typeof parsed.base64 === 'string' ? parsed.base64.trim() : '';
  const payload = rawBase64.includes(',') ? (rawBase64.split(',').pop() ?? '') : rawBase64;
  if (!payload) {
    return {
      statusCode: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing base64 image payload.' }),
    };
  }

  const mime = (parsed.contentType?.trim() || 'image/jpeg').toLowerCase();
  if (!ALLOWED.has(mime)) {
    return {
      statusCode: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Use JPG, PNG, or WebP.' }),
    };
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(payload, 'base64');
  } catch {
    return {
      statusCode: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid base64 image payload.' }),
    };
  }

  if (buf.length > MAX_BYTES) {
    return {
      statusCode: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'File must be 5MB or smaller.' }),
    };
  }
  if (!magicMatches(buf, mime)) {
    return {
      statusCode: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'File does not match its type.' }),
    };
  }

  const admin = createSupabaseService(svc.url, svc.serviceKey);
  const objectKey = `${auth.user.id}/avatar.jpg`;
  const { error: uploadError } = await admin.storage.from(AVATARS_BUCKET).upload(objectKey, buf, {
    contentType: mime,
    upsert: true,
    cacheControl: '3600',
  });
  if (uploadError) {
    console.error('[upload-avatar]', uploadError.message);
    return {
      statusCode: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Upload failed.' }),
    };
  }

  const { data } = admin.storage.from(AVATARS_BUCKET).getPublicUrl(objectKey);
  const publicUrl = data.publicUrl?.trim();
  if (!publicUrl) {
    return {
      statusCode: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Upload failed.' }),
    };
  }
  const busted = `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;

  // Best-effort profile row — do not fail the upload if this lags.
  void admin
    .from('profiles')
    .update({ avatar_url: busted })
    .eq('id', auth.user.id)
    .then(({ error }) => {
      if (error) console.warn('[upload-avatar] profiles update', error.message);
    });

  return {
    statusCode: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: busted }),
  };
};
