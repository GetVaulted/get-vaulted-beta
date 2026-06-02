/**
 * End-to-end live discovery debug on beta.
 * Usage: npx tsx scripts/debug-live-discovery-beta.ts
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, '../../web');
config({ path: path.join(webRoot, '.env'), quiet: true });
config({ path: path.join(webRoot, '.env.local'), override: true, quiet: true });

const BASE = (process.env.BETA_API_BASE_URL || 'https://beta.shopgetvaulted.com').replace(/\/+$/, '');
const PW =
  process.env.BETA_QA_PASSWORD?.trim() ||
  process.env.BETA_QA_ACCOUNT_PASSWORD?.trim() ||
  'VaultedBetaQA1!';

type RoomRow = {
  id: string;
  title: string;
  status: string;
  scheduledStartAt: string | null;
  startedAt?: string | null;
  roomType: string;
  category: string;
  sellerUsername: string;
};

async function bearer(email: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error('Missing Supabase env in web/.env.local');
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: email.toLowerCase(), password: PW });
  if (error || !data.session?.access_token) throw new Error(`${email}: ${error?.message ?? 'no session'}`);
  return data.session.access_token;
}

async function getJson<T>(path: string, token?: string): Promise<{ status: number; json: T }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers, cache: 'no-store' });
  const json = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, json };
}

async function main() {
  console.log(`\n=== Live discovery debug @ ${BASE} ===\n`);

  const sellerTok = await bearer('sellerqa@getvaultedtest.com');
  console.log('✓ sellerqa Bearer OK');

  const pub = await getJson<{ rooms?: RoomRow[] }>('/api/live-rooms?limit=120');
  const pubRooms = pub.json.rooms ?? [];
  console.log(`PUBLIC GET /api/live-rooms → HTTP ${pub.status}, ${pubRooms.length} rooms`);

  const mine = await getJson<{ rooms?: RoomRow[] }>('/api/live-rooms?mine=1&includeEnded=1&limit=50', sellerTok);
  const mineRooms = mine.json.rooms ?? [];
  console.log(`SELLER mine → HTTP ${mine.status}, ${mineRooms.length} rooms\n`);

  const recent = mineRooms.slice(0, 15);
  console.log('--- Seller rooms (recent) ---');
  for (const r of recent) {
    const inPub = pubRooms.some((p) => p.id === r.id);
    console.log(
      [
        inPub ? 'IN-PUB' : 'NOT-PUB',
        r.status.padEnd(9),
        r.roomType.padEnd(8),
        r.id,
        JSON.stringify(r.title.slice(0, 50)),
        r.scheduledStartAt ?? 'no-schedule',
      ].join(' | '),
    );
  }

  const notInPub = mineRooms.filter(
    (r) => (r.status === 'scheduled' || r.status === 'live') && !pubRooms.some((p) => p.id === r.id),
  );
  if (notInPub.length) {
    console.log('\n--- Scheduled/live seller rooms MISSING from public list ---');
    for (const r of notInPub.slice(0, 10)) {
      console.log(JSON.stringify({ id: r.id, title: r.title, status: r.status, category: r.category }));
    }
  }

  const target =
    mineRooms.find((r) => /smoke|Phase 2|vault|test/i.test(r.title)) ??
    mineRooms.find((r) => r.status === 'live') ??
    mineRooms.find((r) => r.status === 'scheduled') ??
    mineRooms[0];

  if (!target) {
    console.log('\nNo seller rooms found.');
    return;
  }

  const detail = await getJson<{ room?: Record<string, unknown> }>(
    `/api/live-rooms/${encodeURIComponent(target.id)}`,
    sellerTok,
  );
  const room = detail.json.room ?? {};
  const stream = await getJson<{ stream?: Record<string, unknown> }>(
    `/api/live-rooms/${encodeURIComponent(target.id)}/stream`,
  );

  console.log('\n--- Target room detail ---');
  console.log(
    JSON.stringify(
      {
        seller: 'sellerqa@getvaultedtest.com',
        id: target.id,
        title: room.title ?? target.title,
        status: room.status ?? target.status,
        scheduledStartAt: room.scheduledStartAt ?? target.scheduledStartAt,
        startedAt: room.startedAt ?? null,
        roomType: room.roomType ?? target.roomType,
        category: room.category ?? target.category,
        streamMode: room.streamMode ?? stream.json.stream?.streamMode ?? null,
        inPublicList: pubRooms.some((p) => p.id === target.id),
      },
      null,
      2,
    ),
  );

  console.log('\n--- Public list sellerqa summary ---');
  console.log(`live: ${liveSellerqa.length}, scheduled: ${schedSellerqa.length}`);
  for (const r of [...liveSellerqa, ...schedSellerqa].slice(0, 8)) {
    console.log(`  ${r.status} | ${r.id} | ${r.title}`);
  }

  console.log('\n--- Mobile env check (local) ---');
  const mobileEnv = path.join(__dirname, '../.env');
  const mobileEnvLocal = path.join(__dirname, '../.env.local');
  config({ path: mobileEnv, override: true, quiet: true });
  config({ path: mobileEnvLocal, override: true, quiet: true });
  console.log('EXPO_PUBLIC_SITE_URL:', process.env.EXPO_PUBLIC_SITE_URL ?? '(unset)');
  console.log('EXPO_PUBLIC_WEB_API_URL:', process.env.EXPO_PUBLIC_WEB_API_URL ?? '(unset)');
  console.log('EXPO_PUBLIC_NETLIFY_FUNCTIONS_BASE:', process.env.EXPO_PUBLIC_NETLIFY_FUNCTIONS_BASE ?? '(unset)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
