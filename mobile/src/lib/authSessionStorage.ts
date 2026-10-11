import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { reportAuthDiagnostic } from './authDiagnostics';

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
let rootLoad: Promise<PersistRoot> | null = null;

function defaultRoot(): PersistRoot {
  return { v: 1, keepLoggedIn: '1', kv: {} };
}

function storeBase(): string | null {
  // Prefer durable document storage — cache can be purged mid–Google OAuth and drop the PKCE verifier.
  return FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? null;
}

function storePath(): string | null {
  const base = storeBase();
  return base ? `${base}gv-auth-store-v1.json` : null;
}

/**
 * Second copy of the saved login. The two files are always written one after the other, never at the
 * same time, so if Android kills the app mid-write at most one of them is damaged and the other
 * still holds a complete login.
 */
function backupPath(): string | null {
  const base = storeBase();
  return base ? `${base}gv-auth-store-v1.bak.json` : null;
}

function parseRoot(raw: string): PersistRoot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistRoot> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.kv !== 'object' || parsed.kv === null || Array.isArray(parsed.kv)) return null;
    return { v: 1, keepLoggedIn: parsed.keepLoggedIn === '0' ? '0' : '1', kv: parsed.kv as Record<string, string> };
  } catch {
    return null;
  }
}

type FileRead = { status: 'ok'; root: PersistRoot } | { status: 'missing' } | { status: 'bad' };

async function readStoreFile(path: string): Promise<FileRead> {
  // One quick retry: a read that races another write or a momentary I/O hiccup must not be mistaken
  // for "no saved login".
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) return { status: 'missing' };
      const raw = await FileSystem.readAsStringAsync(path);
      const root = parseRoot(raw);
      if (root) return { status: 'ok', root };
    } catch {
      /* fall through to retry */
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 60));
  }
  return { status: 'bad' };
}

async function readRootFromDisk(): Promise<PersistRoot> {
  if (Platform.OS === 'web') {
    try {
      const raw = globalThis.localStorage?.getItem(WEB_LS_KEY);
      if (!raw) return defaultRoot();
      return parseRoot(raw) ?? defaultRoot();
    } catch {
      return defaultRoot();
    }
  }
  const path = storePath();
  const bak = backupPath();
  if (!path || !bak) return defaultRoot();

  const primary = await readStoreFile(path);
  if (primary.status === 'ok') return primary.root;

  const backup = await readStoreFile(bak);
  if (backup.status === 'ok') {
    // Primary was damaged (or lost) but the backup is intact: this used to log the user out.
    if (primary.status === 'bad') reportAuthDiagnostic('auth_store_primary_bad_restored_from_backup');
    queueWrite(JSON.stringify(backup.root));
    return backup.root;
  }

  if (primary.status === 'bad' || backup.status === 'bad') {
    reportAuthDiagnostic('auth_store_unreadable', { primary: primary.status, backup: backup.status });
  }
  return defaultRoot();
}

// ---- serialized, coalesced writes -------------------------------------------------------------

let pendingPayload: string | null = null;
let drainPromise: Promise<void> | null = null;

async function writeOneFile(path: string, payload: string): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(path, payload);
  } catch {
    await new Promise((r) => setTimeout(r, 80));
    await FileSystem.writeAsStringAsync(path, payload);
  }
}

async function drainWrites(): Promise<void> {
  while (pendingPayload !== null) {
    const payload = pendingPayload;
    pendingPayload = null;
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(WEB_LS_KEY, payload);
      continue;
    }
    const path = storePath();
    const bak = backupPath();
    if (!path || !bak) continue;
    try {
      await writeOneFile(path, payload);
    } catch (e) {
      reportAuthDiagnostic('auth_store_write_failed', { file: 'primary', message: String((e as Error)?.message ?? e).slice(0, 120) });
    }
    try {
      await writeOneFile(bak, payload);
    } catch (e) {
      reportAuthDiagnostic('auth_store_write_failed', { file: 'backup', message: String((e as Error)?.message ?? e).slice(0, 120) });
    }
  }
}

/** Queue the latest snapshot; only one write sequence ever runs at a time. Resolves when it is on disk. */
function queueWrite(payload: string): Promise<void> {
  pendingPayload = payload;
  if (!drainPromise) {
    drainPromise = drainWrites().finally(() => {
      drainPromise = null;
    });
  }
  return drainPromise;
}

async function loadRoot(): Promise<PersistRoot> {
  if (rootCache) return rootCache;
  if (!rootLoad) {
    rootLoad = readRootFromDisk()
      .then((r) => {
        rootCache = r;
        return r;
      })
      .finally(() => {
        rootLoad = null;
      });
  }
  return rootLoad;
}

async function saveRoot(next: PersistRoot): Promise<void> {
  rootCache = next;
  await queueWrite(JSON.stringify(next));
}

async function useDiskPersistence(): Promise<boolean> {
  if (prefCache !== null) return prefCache;
  const root = await loadRoot();
  prefCache = root.keepLoggedIn !== '0';
  return prefCache;
}

/** PKCE code verifier must survive the Google browser hop even when “keep me logged in” is off. */
function isPkceVerifierKey(key: string): boolean {
  return key.includes('code-verifier');
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
    if (isPkceVerifierKey(key)) {
      const root = await loadRoot();
      return root.kv[key] ?? memory.get(key) ?? null;
    }
    const disk = await useDiskPersistence();
    if (!disk) return memory.get(key) ?? null;
    const root = await loadRoot();
    return root.kv[key] ?? null;
  },
  setItem: async (key: string, value: string) => {
    if (isPkceVerifierKey(key)) {
      memory.set(key, value);
      const root = await loadRoot();
      root.kv[key] = value;
      await saveRoot(root);
      return;
    }
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

/** Wipe all persisted Supabase auth tokens (QA hard reset). */
export async function clearAuthStore(): Promise<void> {
  memory.clear();
  prefCache = null;
  rootCache = defaultRoot();
  await saveRoot(rootCache);
}
