import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const WEB_LS_KEY = 'gv_auth_store_v1';

type PersistRoot = {
  v: 1;
  /** Persisted “keep me logged in” choice (survives restarts). */
  keepLoggedIn: '0' | '1';
  /** Supabase Auth keys (e.g. sb-*-auth-token) → serialized session chunks. */
  kv: Record<string, string>;
};

const memory = new Map<string, string>();

let prefCache: boolean | null = null;
let rootCache: PersistRoot | null = null;

function defaultRoot(): PersistRoot {
  return { v: 1, keepLoggedIn: '1', kv: {} };
}

function storePath(): string | null {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}gv-auth-store-v1.json`;
}

async function readRootFromDisk(): Promise<PersistRoot> {
  if (Platform.OS === 'web') {
    try {
      const raw = globalThis.localStorage?.getItem(WEB_LS_KEY);
      if (!raw) return defaultRoot();
      const parsed = JSON.parse(raw) as Partial<PersistRoot>;
      return {
        v: 1,
        keepLoggedIn: parsed.keepLoggedIn === '0' ? '0' : '1',
        kv: typeof parsed.kv === 'object' && parsed.kv !== null ? parsed.kv : {},
      };
    } catch {
      return defaultRoot();
    }
  }
  const path = storePath();
  if (!path) return defaultRoot();
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return defaultRoot();
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as Partial<PersistRoot>;
    return {
      v: 1,
      keepLoggedIn: parsed.keepLoggedIn === '0' ? '0' : '1',
      kv: typeof parsed.kv === 'object' && parsed.kv !== null ? parsed.kv : {},
    };
  } catch {
    return defaultRoot();
  }
}

async function writeRootToDisk(root: PersistRoot): Promise<void> {
  const payload = JSON.stringify(root);
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(WEB_LS_KEY, payload);
    return;
  }
  const path = storePath();
  if (!path) return;
  await FileSystem.writeAsStringAsync(path, payload);
}

async function loadRoot(): Promise<PersistRoot> {
  if (rootCache) return rootCache;
  rootCache = await readRootFromDisk();
  return rootCache;
}

async function saveRoot(next: PersistRoot): Promise<void> {
  rootCache = next;
  await writeRootToDisk(next);
}

async function useDiskPersistence(): Promise<boolean> {
  if (prefCache !== null) return prefCache;
  const root = await loadRoot();
  prefCache = root.keepLoggedIn !== '0';
  return prefCache;
}

/**
 * Persisted choice for “Keep me logged in”. When false, Supabase session lives in memory only
 * (lost when the app process ends).
 */
export async function setKeepMeLoggedInPreference(persist: boolean): Promise<void> {
  prefCache = persist;
  const root = await loadRoot();
  root.keepLoggedIn = persist ? '1' : '0';
  await saveRoot(root);
}

export async function getKeepMeLoggedInPreference(): Promise<boolean> {
  return useDiskPersistence();
}

/** Supabase Auth storage — disk file (native) / localStorage (web), or in-memory when “keep me logged in” is off. */
export const supabaseAuthStorage = {
  getItem: async (key: string) => {
    const disk = await useDiskPersistence();
    if (!disk) return memory.get(key) ?? null;
    const root = await loadRoot();
    return root.kv[key] ?? null;
  },
  setItem: async (key: string, value: string) => {
    const disk = await useDiskPersistence();
    if (!disk) {
      memory.set(key, value);
      return;
    }
    const root = await loadRoot();
    root.kv[key] = value;
    await saveRoot(root);
  },
  removeItem: async (key: string) => {
    memory.delete(key);
    const root = await loadRoot();
    if (key in root.kv) {
      delete root.kv[key];
      await saveRoot(root);
    }
  },
};
