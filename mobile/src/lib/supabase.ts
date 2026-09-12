import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAuthStorage } from './authSessionStorage';
import { buildWebApiUrl } from './webApiBaseUrl';

let client: SupabaseClient | null = null;
let configuredUrl: string | null = null;
let configuredKey: string | null = null;
let bootstrapPromise: Promise<void> | null = null;

/**
 * Every cold start previously blocked on a network round-trip to `/api/mobile/supabase-config`
 * before auth could even begin resolving (`AuthProvider` awaits `ensureSupabaseReady()` first
 * thing) — real, unavoidable latency added to every single launch for config that essentially
 * never changes deploy-to-deploy. Cache the last-good config on disk: a cached value is applied
 * immediately (unblocking bootstrap with no network wait) while a fresh fetch still runs in the
 * background and updates the cache + live client for next time, so a real key rotation still
 * lands within one extra launch — it just no longer sits in the critical path of every launch.
 */
const CONFIG_CACHE_KEY = 'gv_supabase_config_v1';
type CachedConfig = { supabaseUrl: string; supabaseAnonKey: string };

async function readCachedConfig(): Promise<CachedConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedConfig>;
    const url = parsed.supabaseUrl?.trim() ?? '';
    const key = parsed.supabaseAnonKey?.trim() ?? '';
    if (!url || !isPlausibleSupabaseAnonKey(key)) return null;
    return { supabaseUrl: url, supabaseAnonKey: key };
  } catch {
    return null;
  }
}

async function writeCachedConfig(config: CachedConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config));
  } catch {
    /* best-effort cache — a failed write just means the next launch pays the network cost again */
  }
}

function readBundledUrl(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
}

function readBundledKey(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
}

export function isPlausibleSupabaseAnonKey(key: string): boolean {
  const k = key.trim();
  if (!k || k === 'your_anon_key') return false;
  if (k.startsWith('sb_publishable_') && k.length >= 20) return true;
  if (k.startsWith('eyJ') && k.length >= 80) return true;
  return false;
}

function bundledCredentials(): { url: string; key: string } | null {
  const url = readBundledUrl();
  const key = readBundledKey();
  if (!url || url.includes('YOUR_PROJECT')) return null;
  if (!isPlausibleSupabaseAnonKey(key)) return null;
  return { url, key };
}

function createSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      storage: supabaseAuthStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}

function applyCredentials(url: string, key: string): void {
  if (configuredUrl === url && configuredKey === key && client) return;
  configuredUrl = url;
  configuredKey = key;
  client = createSupabaseClient(url, key);
}

/**
 * Set when `resetSupabaseBootstrap` runs (currently: after an "Invalid API key" sign-up retry —
 * see AuthContext). The next `ensureSupabaseReady()` call must not immediately reapply the same
 * cached config that got us into this state, so it skips the cache-first path once and forces a
 * genuine network fetch, same as pre-cache behavior.
 */
let forceNetworkOnNextBootstrap = false;

export function resetSupabaseBootstrap(): void {
  bootstrapPromise = null;
  configuredUrl = null;
  configuredKey = null;
  client = null;
  forceNetworkOnNextBootstrap = true;
  void AsyncStorage.removeItem(CONFIG_CACHE_KEY);
}

async function bootstrapSupabaseFromSite(): Promise<void> {
  const { url: apiUrl } = buildWebApiUrl('/api/mobile/supabase-config');
  if (apiUrl) {
    try {
      const res = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const payload = (await res.json()) as { supabaseUrl?: string; supabaseAnonKey?: string };
        const url = payload.supabaseUrl?.trim() ?? '';
        const key = payload.supabaseAnonKey?.trim() ?? '';
        if (url && isPlausibleSupabaseAnonKey(key)) {
          applyCredentials(url, key);
          void writeCachedConfig({ supabaseUrl: url, supabaseAnonKey: key });
          return;
        }
      }
    } catch {
      /* fall through to bundled credentials */
    }
  }

  const bundled = bundledCredentials();
  if (bundled) {
    applyCredentials(bundled.url, bundled.key);
  }
}

/**
 * Prefer live beta config over stale EAS-baked keys (fixes Invalid API key on store builds).
 *
 * Cache-first: a previously-cached config (see `CONFIG_CACHE_KEY` above) is applied immediately so
 * this resolves without waiting on the network, while a fresh fetch still runs in the background to
 * catch a real key rotation for next launch. Only a genuinely first-ever launch (nothing cached
 * yet) pays the network round-trip synchronously, same as before.
 */
export async function ensureSupabaseReady(): Promise<void> {
  if (bootstrapPromise) {
    await bootstrapPromise;
    return;
  }

  if (forceNetworkOnNextBootstrap) {
    forceNetworkOnNextBootstrap = false;
    bootstrapPromise = bootstrapSupabaseFromSite();
    await bootstrapPromise;
    return;
  }

  const cached = await readCachedConfig();
  if (cached) {
    applyCredentials(cached.supabaseUrl, cached.supabaseAnonKey);
    bootstrapPromise = Promise.resolve();
    // Background refresh — not awaited by this call. Keeps the cache (and live client, if it
    // changed) current without adding network latency to this or any other in-flight launch.
    void bootstrapSupabaseFromSite();
    return;
  }

  bootstrapPromise = bootstrapSupabaseFromSite();
  await bootstrapPromise;
}

export function isSupabaseConfigured(): boolean {
  if (configuredUrl && configuredKey) return true;
  return Boolean(bundledCredentials());
}

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const bundled = bundledCredentials();
  if (!bundled) return null;
  applyCredentials(bundled.url, bundled.key);
  return client;
}

export function supabaseAnonKeyPrefix(): string | null {
  const key = configuredKey ?? readBundledKey();
  if (!key) return null;
  return key.slice(0, Math.min(16, key.length));
}
