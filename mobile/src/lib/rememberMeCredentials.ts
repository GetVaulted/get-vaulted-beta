import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const WEB_LS_KEY = 'gv_remember_me_v1';

type RememberMeStore = {
  v: 1;
  rememberMe: '0' | '1';
  email?: string;
  password?: string;
};

let cache: RememberMeStore | null = null;

function defaultStore(): RememberMeStore {
  return { v: 1, rememberMe: '0' };
}

function storePath(): string | null {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}gv-remember-me-v1.json`;
}

async function readStoreFromDisk(): Promise<RememberMeStore> {
  if (Platform.OS === 'web') {
    try {
      const raw = globalThis.localStorage?.getItem(WEB_LS_KEY);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw) as Partial<RememberMeStore>;
      return {
        v: 1,
        rememberMe: parsed.rememberMe === '1' ? '1' : '0',
        email: typeof parsed.email === 'string' ? parsed.email : undefined,
        password: typeof parsed.password === 'string' ? parsed.password : undefined,
      };
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
    const parsed = JSON.parse(raw) as Partial<RememberMeStore>;
    return {
      v: 1,
      rememberMe: parsed.rememberMe === '1' ? '1' : '0',
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
      password: typeof parsed.password === 'string' ? parsed.password : undefined,
    };
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

export async function loadRememberedCredentials(): Promise<{ email: string; password: string } | null> {
  const store = await loadStore();
  if (store.rememberMe !== '1') return null;
  const email = store.email?.trim().toLowerCase();
  const password = store.password;
  if (!email || !password) return null;
  return { email, password };
}

/** Persists or clears saved sign-in credentials based on the Remember me choice. */
export async function persistRememberMeCredentials(
  rememberMe: boolean,
  email: string,
  password: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!rememberMe || !normalizedEmail || !password) {
    await saveStore(defaultStore());
    return;
  }
  await saveStore({
    v: 1,
    rememberMe: '1',
    email: normalizedEmail,
    password,
  });
}

export async function clearRememberMeCredentials(): Promise<void> {
  await saveStore(defaultStore());
}
