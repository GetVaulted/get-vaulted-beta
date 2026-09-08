import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAuthStorage } from './authSessionStorage';
import { buildWebApiUrl } from './webApiBaseUrl';

let client: SupabaseClient | null = null;
let configuredUrl: string | null = null;
let configuredKey: string | null = null;
let bootstrapPromise: Promise<void> | null = null;

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

export function resetSupabaseBootstrap(): void {
  bootstrapPromise = null;
  configuredUrl = null;
  configuredKey = null;
  client = null;
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

/** Prefer live beta config over stale EAS-baked keys (fixes Invalid API key on store builds). */
export async function ensureSupabaseReady(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapSupabaseFromSite();
  }
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
