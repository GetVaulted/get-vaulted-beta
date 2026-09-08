import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { Linking, Platform } from 'react-native';

const STORAGE_KEY = 'gv_store_review_v1';

/** App Store / Play listing — also set on app.json for StoreReview.storeUrl(). */
export const IOS_APP_STORE_URL = 'https://apps.apple.com/app/id6780714456';
export const ANDROID_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.getvaulted.app';

const MIN_DAYS_BETWEEN_PROMPTS = 45;
const MAX_PROMPTS = 3;

type StoreReviewState = {
  promptCount: number;
  lastPromptAt: string | null;
};

async function readState(): Promise<StoreReviewState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { promptCount: 0, lastPromptAt: null };
    const parsed = JSON.parse(raw) as Partial<StoreReviewState>;
    return {
      promptCount: typeof parsed.promptCount === 'number' ? parsed.promptCount : 0,
      lastPromptAt: typeof parsed.lastPromptAt === 'string' ? parsed.lastPromptAt : null,
    };
  } catch {
    return { promptCount: 0, lastPromptAt: null };
  }
}

async function writeState(next: StoreReviewState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function daysSince(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

export function storeListingUrl(): string {
  return Platform.OS === 'ios' ? IOS_APP_STORE_URL : ANDROID_PLAY_STORE_URL;
}

/** Opens the App Store / Play Store listing (for Settings “Rate Get Vaulted”). */
export async function openStoreListingForReview(): Promise<void> {
  const url = (await StoreReview.storeUrl()) ?? storeListingUrl();
  const can = await Linking.canOpenURL(url);
  if (can) await Linking.openURL(url);
}

/**
 * Ask Apple / Google to show the native in-app rating sheet.
 * OS may silently no-op (already reviewed, quota, user disabled). Safe to call after a win moment.
 */
export async function maybeRequestStoreReview(_reason: string): Promise<void> {
  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    const state = await readState();
    if (state.promptCount >= MAX_PROMPTS) return;
    if (daysSince(state.lastPromptAt) < MIN_DAYS_BETWEEN_PROMPTS) return;

    const hasAction = await StoreReview.hasAction();
    if (!hasAction) return;

    await StoreReview.requestReview();
    await writeState({
      promptCount: state.promptCount + 1,
      lastPromptAt: new Date().toISOString(),
    });
  } catch {
    /* never block the happy path on review failures */
  }
}
