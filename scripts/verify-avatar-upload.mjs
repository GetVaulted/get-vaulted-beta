/**
 * Proves the production avatar upload path works end-to-end.
 * Usage (from repo root, Netlify CLI logged in):
 *   node scripts/verify-avatar-upload.mjs
 *
 * Does not print secrets. Creates a throwaway user, uploads a tiny JPEG via
 * the Netlify function + Next API, checks public URL, then deletes the user.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

function envGet(key) {
  try {
    const out = execSync(`netlify env:get ${key} --context production`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    const lines = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^›/.test(l) && !/netlify/i.test(l) && !/loading/i.test(l) && !/^\$/.test(l));
    return lines[lines.length - 1] || '';
  } catch {
    return '';
  }
}

// Minimal JPEG with valid SOI magic (FF D8) — 12+ bytes for server checks.
const JPEG_B64 = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  Buffer.alloc(32, 0),
  Buffer.from([0xff, 0xd9]),
]).toString('base64');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function postJson(url, token, body) {
  const started = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-GV-Client': 'getvaulted-mobile',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text: text.slice(0, 200), ms: Date.now() - started };
}

async function main() {
  const url = envGet('SUPABASE_URL') || envGet('NEXT_PUBLIC_SUPABASE_URL') || 'https://xkaaicokjgmpbctfermj.supabase.co';
  const service = envGet('SUPABASE_SERVICE_ROLE_KEY');
  const anon = envGet('NEXT_PUBLIC_SUPABASE_ANON_KEY') || envGet('SUPABASE_ANON_KEY');
  assert(service, 'Missing SUPABASE_SERVICE_ROLE_KEY in Netlify production env');
  assert(anon, 'Missing anon key in Netlify production env');

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `avatar-verify-${Date.now()}-${randomBytes(3).toString('hex')}@example.com`;
  const password = `Av!${randomBytes(8).toString('hex')}`;

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert(!created.error && created.data.user?.id, `createUser failed: ${created.error?.message}`);
  const userId = created.data.user.id;

  try {
    const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await anonClient.auth.signInWithPassword({ email, password });
    assert(!signedIn.error && signedIn.data.session?.access_token, `signIn failed: ${signedIn.error?.message}`);
    const token = signedIn.data.session.access_token;

    const unauth = await fetch('https://shopgetvaulted.com/.netlify/functions/upload-avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ base64: JPEG_B64, contentType: 'image/jpeg' }),
    });
    console.log('unauth_function', unauth.status);

    const viaFn = await postJson(
      'https://shopgetvaulted.com/.netlify/functions/upload-avatar',
      token,
      { base64: JPEG_B64, contentType: 'image/jpeg' },
    );
    console.log('function_upload', { status: viaFn.status, ms: viaFn.ms, url: Boolean(viaFn.json?.url), err: viaFn.json?.error || null });
    assert(viaFn.status === 200 && viaFn.json?.url, `function upload failed: ${viaFn.text}`);

    const img = await fetch(viaFn.json.url);
    console.log('public_url', { status: img.status, contentType: img.headers.get('content-type') });
    assert(img.ok, `public avatar URL not readable: ${img.status}`);

    const viaApi = await postJson('https://shopgetvaulted.com/api/uploads/avatar', token, {
      base64: JPEG_B64,
      contentType: 'image/jpeg',
    });
    console.log('next_api_upload', {
      status: viaApi.status,
      ms: viaApi.ms,
      url: Boolean(viaApi.json?.url),
      err: viaApi.json?.error || null,
    });
    assert(viaApi.status === 200 && viaApi.json?.url, `next api upload failed: ${viaApi.text}`);

    const { data: profile } = await admin.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
    console.log('profile_has_avatar', Boolean(profile?.avatar_url));

    console.log('PASS avatar upload verified');
  } finally {
    await admin.auth.admin.deleteUser(userId);
    await admin.storage.from('avatars').remove([`${userId}/avatar.jpg`]).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error('FAIL', e instanceof Error ? e.message : e);
  process.exit(1);
});
