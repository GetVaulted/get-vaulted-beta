import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const WEB_LS_KEY = 'gv_remember_me_v1';

/**
 * SECURITY: this module intentionally never persists a password. An earlier version wrote the
 * raw password to a plaintext cache file (native) / localStorage (web) so it could auto-fill the
 * sign-in form, which meant device backup extraction, a rooted/jailbroken device, or malware
 * with cache access could read the plaintext password directly. Staying signed in is already
 * handled by the persisted Supabase session (see authSessionStorage.ts) — this module only
 * remembers the email (not a secret) so the field can be pre-filled.
 */
type RememberMeStore = {
  v: 2;
  rememberMe: '0' | '1';
  email?: string;
};

let cache: RememberMeStore | null = null;

function defaultStore(): RememberMeStore {
  return { v: 2, rememberMe: '0' };
}

function storePath(): string | null {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}gv-remember-me-v1.json`;
}

function normalizeParsed(parsed: Partial<RememberMeStore> & { password?: unknown }): RememberMeStore {
  // A stale v1 payload may still have a `password` field on disk; only v2 (no password) is
  // ever trusted, so any legacy plaintext password is simply never read back into memory.
  if (parsed.v !== 2) return defaultStore();
  return {
    v: 2,
    rememberMe: parsed.rememberMe === '1' ? '1' : '0',
    email: typeof parsed.email === 'string' ? parsed.email : undefined,
  };
}

async function readStoreFromDisk(): Promise<RememberMeStore> {
  if (Platform.OS === 'web') {
    try {
      const raw = globalThis.localStorage?.getItem(WEB_LS_KEY);
      if (!raw) return defaultStore();
      return normalizeParsed(JSON.parse(raw) as Partial<RememberMeStore>);
    } catch {
      return defaultStore();
    }
  }
  const path = storePath();
  if (!path) return defaultStore();
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return defaultStore();
    const raw = await FileSystem.readAsStringAsync(path);
    return normalizeParsed(JSON.parse(raw) as Partial<RememberMeStore>);
  } catch {
    return defaultStore();
  }
}

async function writeStoreToDisk(store: RememberMeStore): Promise<void> {
  const payload = JSON.stringify(store);
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(WEB_LS_KEY, payload);
    return;
  }
  const path = storePath();
  if (!path) return;
  await FileSystem.writeAsStringAsync(path, payload);
}

async function loadStore(): Promise<RememberMeStore> {
  if (cache) return cache;
  cache = await readStoreFromDisk();
  return cache;
}

async function saveStore(next: RememberMeStore): Promise<void> {
  cache = next;
  await writeStoreToDisk(next);
}

export async function getRememberMePreference(): Promise<boolean> {
  const store = await loadStore();
  return store.rememberMe === '1';
}

/** Returns only the remembered email (never a password) for pre-filling the sign-in form. */
export async function loadRememberedEmail(): Promise<string | null> {
  const store = await loadStore();
  if (store.rememberMe !== '1') return null;
  const email = store.email?.trim().toLowerCase();
  return email || null;
}

/** Persists or clears the remembered email/preference based on the Remember me choice. Never stores the password. */
export async function persistRememberMeCredentials(rememberMe: boolean, email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!rememberMe || !normalizedEmail) {
    await saveStore(defaultStore());
    return;
  }
  await saveStore({
    v: 2,
    rememberMe: '1',
    email: normalizedEmail,
  });
}

export async function clearRememberMeCredentials(): Promise<void> {
  await saveStore(defaultStore());
}
