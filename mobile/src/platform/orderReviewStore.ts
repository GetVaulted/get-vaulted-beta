import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const WEB_KEY = 'gv_order_review_v1';
const FILE = 'gv-order-review-v1.json';

type Store = { v: 1; reviewRemindersSent: string[] };

let memory: Store | null = null;

function defaultStore(): Store {
  return { v: 1, reviewRemindersSent: [] };
}

async function load(): Promise<Store> {
  if (memory) return memory;
  try {
    if (Platform.OS === 'web') {
      const raw = globalThis.localStorage?.getItem(WEB_KEY);
      memory = raw ? (JSON.parse(raw) as Store) : defaultStore();
      return memory;
    }
    const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    const p = base ? `${base}${FILE}` : null;
    if (!p) {
      memory = defaultStore();
      return memory;
    }
    const info = await FileSystem.getInfoAsync(p);
    if (!info.exists) {
      memory = defaultStore();
      return memory;
    }
    memory = JSON.parse(await FileSystem.readAsStringAsync(p)) as Store;
    return memory;
  } catch {
    memory = defaultStore();
    return memory;
  }
}

async function save(store: Store): Promise<void> {
  memory = store;
  try {
    const serialized = JSON.stringify(store);
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(WEB_KEY, serialized);
      return;
    }
    const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    const p = base ? `${base}${FILE}` : null;
    if (p) await FileSystem.writeAsStringAsync(p, serialized);
  } catch {
    /* best-effort */
  }
}

export async function markReviewReminderSent(orderId: string): Promise<void> {
  const store = await load();
  if (!store.reviewRemindersSent.includes(orderId)) {
    store.reviewRemindersSent.push(orderId);
    await save(store);
  }
}

export async function wasReviewReminderSent(orderId: string): Promise<boolean> {
  const store = await load();
  return store.reviewRemindersSent.includes(orderId);
}
