import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { LiveStream, Product, ScheduledStream } from '../types';

const WEB_LS_KEY = 'gv_home_feed_v1';
const FILE_NAME = 'gv-home-feed-v1.json';

export type HomeFeedCache = {
  v: 1;
  live: LiveStream[];
  scheduled: ScheduledStream[];
  listings: Product[];
  savedAt: number;
};

let memory: HomeFeedCache | null = null;

function storePath(): string | null {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}${FILE_NAME}`;
}

function isValidCache(raw: unknown): raw is HomeFeedCache {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as HomeFeedCache;
  return o.v === 1 && Array.isArray(o.live) && Array.isArray(o.scheduled) && Array.isArray(o.listings);
}

/** Synchronous read of the in-memory snapshot (warm after first load this session). */
export function getHomeFeedMemorySnapshot(): HomeFeedCache | null {
  return memory;
}

export function hasWarmHomeFeedCache(): boolean {
  const m = memory;
  return Boolean(m && (m.live.length > 0 || m.listings.length > 0));
}

export async function loadHomeFeedCache(): Promise<HomeFeedCache | null> {
  if (memory) return memory;

  try {
    if (Platform.OS === 'web') {
      const raw = globalThis.localStorage?.getItem(WEB_LS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!isValidCache(parsed)) return null;
      memory = parsed;
      return parsed;
    }
    const path = storePath();
    if (!path) return null;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidCache(parsed)) return null;
    memory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveHomeFeedCache(payload: Omit<HomeFeedCache, 'v' | 'savedAt'>): Promise<void> {
  const next: HomeFeedCache = {
    v: 1,
    live: payload.live,
    scheduled: payload.scheduled,
    listings: payload.listings,
    savedAt: Date.now(),
  };
  memory = next;
  try {
    const serialized = JSON.stringify(next);
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(WEB_LS_KEY, serialized);
      return;
    }
    const path = storePath();
    if (!path) return;
    await FileSystem.writeAsStringAsync(path, serialized);
  } catch {
    /* best-effort */
  }
}
