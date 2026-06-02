/**
 * Mobile create-room API smoke against deployed beta.
 * Uses buildCreateLiveRoomPayload + Bearer auth (same path as mobile app).
 *
 * Usage (from mobile/):
 *   npx tsx scripts/smoke-create-live-room-beta.ts
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCreateLiveRoomPayload, alignScheduleToQuarterHour } from '../src/lib/createLiveRoomPayload';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, '../../web');
config({ path: path.join(webRoot, '.env'), quiet: true });
config({ path: path.join(webRoot, '.env.local'), override: true, quiet: true });

const BASE = (process.env.BETA_API_BASE_URL || process.env.EXPO_PUBLIC_SITE_URL || 'https://beta.shopgetvaulted.com').replace(
  /\/+$/,
  '',
);
const SELLER_EMAIL = process.env.BETA_QA_SELLER_EMAIL || 'sellerqa@getvaultedtest.com';
const PASSWORD =
  process.env.BETA_QA_PASSWORD?.trim() ||
  process.env.BETA_QA_ACCOUNT_PASSWORD?.trim() ||
  'VaultedBetaQA1!';

/** Fields accepted by POST /api/live-rooms (web/src/app/api/live-rooms/route.ts PostBody). */
const WEB_SUPPORTED_FIELDS = new Set([
  'title',
  'description',
  'category',
  'roomType',
  'thumbnailUrl',
  'scheduledStartAt',
  'teamBoardLeague',
  'breakTotalSpots',
  'breakPricingMode',
  'breakSpotPriceUsd',
  'teamSelectionBoardEnabled',
  'tipModeratorId',
  'tipRecipientMode',
  'tipsToModerator',
]);

type Scenario = {
  name: string;
  input: Parameters<typeof buildCreateLiveRoomPayload>[0];
};

function assertBodySupported(body: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(body)) {
    if (!WEB_SUPPORTED_FIELDS.has(key)) errors.push(`unsupported field: ${key}`);
  }
  if (!body.title || typeof body.title !== 'string') errors.push('missing title');
  if (!body.roomType || typeof body.roomType !== 'string') errors.push('missing roomType');
  return errors;
}

async function getBearerToken(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in web/.env.local');
  }
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email: SELLER_EMAIL.toLowerCase(),
    password: PASSWORD,
  });
  if (error || !data.session?.access_token) {
    throw new Error(`Supabase sign-in failed: ${error?.message ?? 'no session'}`);
  }
  return data.session.access_token;
}

async function postLiveRoom(token: string, body: Record<string, unknown>) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-GV-Client': 'getvaulted-mobile',
    'User-Agent': 'GetVaultedMobile/1.0 (smoke)',
  };
  const basic = process.env.EXPO_PUBLIC_BETA_HTTP_BASIC?.trim();
  if (basic && !headers.Authorization.startsWith('Bearer ')) {
    headers.Authorization = basic.startsWith('Basic ') ? basic : `Basic ${basic}`;
  }

  const res = await fetch(`${BASE}/api/live-rooms`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let json: { id?: string; error?: string; code?: string } = {};
  try {
    json = raw ? (JSON.parse(raw) as typeof json) : {};
  } catch {
    json = { error: raw.slice(0, 200) };
  }
  return { res, json, raw };
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 16);
  const scheduledAt = alignScheduleToQuarterHour(new Date(Date.now() + 2 * 60 * 60 * 1000)).toISOString();

  const scenarios: Scenario[] = [
    {
      name: 'auction scheduled',
      input: {
        title: `[smoke] auction scheduled ${stamp}`,
        description: 'Mobile Phase 2 smoke',
        category: 'Trading Cards',
        roomType: 'auction',
        scheduleMode: 'later',
        scheduledStartAt: scheduledAt,
      },
    },
    {
      name: 'auction start now',
      input: {
        title: `[smoke] auction start now ${stamp}`,
        description: 'Mobile Phase 2 smoke',
        category: 'Other',
        roomType: 'auction',
        scheduleMode: 'now',
      },
    },
    {
      name: 'break fixed price',
      input: {
        title: `[smoke] break fixed ${stamp}`,
        roomType: 'break',
        scheduleMode: 'now',
        category: 'Other',
        teamBoardLeague: 'nfl',
        breakTotalSpots: '32',
        breakPricingMode: 'fixed',
        breakSpotPrice: '49.99',
        teamSelectionBoardEnabled: true,
      },
    },
    {
      name: 'break auction pricing',
      input: {
        title: `[smoke] break auction ${stamp}`,
        roomType: 'break',
        scheduleMode: 'later',
        scheduledStartAt: scheduledAt,
        category: 'Memorabilia',
        teamBoardLeague: 'nba',
        breakTotalSpots: 30,
        breakPricingMode: 'auction',
        teamSelectionBoardEnabled: false,
      },
    },
  ];

  console.log(`\n=== Mobile create-room smoke @ ${BASE} ===`);
  console.log(`Seller: ${SELLER_EMAIL}\n`);

  const token = await getBearerToken();
  console.log('✓ Supabase Bearer token acquired\n');

  const results: {
    name: string;
    ok: boolean;
    status: number;
    roomId?: string;
    body: Record<string, unknown>;
    errors: string[];
  }[] = [];

  for (const scenario of scenarios) {
    const body = buildCreateLiveRoomPayload(scenario.input);
    const fieldErrors = assertBodySupported(body);
    const { res, json } = await postLiveRoom(token, body);
    const ok = res.ok && typeof json.id === 'string' && fieldErrors.length === 0;
    const errors = [...fieldErrors];
    if (!res.ok) errors.push(`HTTP ${res.status}: ${json.error ?? JSON.stringify(json)}`);
    if (res.ok && !json.id) errors.push('200 but missing id');

    results.push({
      name: scenario.name,
      ok,
      status: res.status,
      roomId: json.id,
      body,
      errors,
    });

    console.log(`${ok ? '✓' : '✗'} ${scenario.name}`);
    console.log(`  POST body: ${JSON.stringify(body)}`);
    console.log(`  HTTP ${res.status}${json.id ? ` → room ${json.id}` : ''}`);
    if (errors.length) console.log(`  errors: ${errors.join('; ')}`);
    console.log('');
  }

  const failed = results.filter((r) => !r.ok);
  console.log('--- Summary ---');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.status})${r.roomId ? `  id=${r.roomId}` : ''}`);
  }

  if (failed.length) {
    console.error(`\n${failed.length}/${results.length} scenarios failed`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} scenarios passed — bodies match web-supported fields and beta accepted them.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
