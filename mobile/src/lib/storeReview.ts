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

/** Opens the App Store / Play Store listing (for Settings “Rate Get Vaulted”, and the Android half
 * of the "Enjoying the app?" gate below — see confirmEnjoyingApp). */
export async function openStoreListingForReview(): Promise<void> {
  const url = (await StoreReview.storeUrl()) ?? storeListingUrl();
  const can = await Linking.canOpenURL(url);
  if (can) await Linking.openURL(url);
}

/**
 * Throttle check for the "Enjoying Get Vaulted?" gate (see components/reviews/ReviewPromptGate) —
 * same cap Apple enforces itself on the native prompt (max 3/year), plus a minimum gap so we're
 * not re-asking every session. Call this before showing the gate; call `recordReviewPromptShown`
 * once it's actually shown (regardless of which button they tap) so the cap counts appearances of
 * *our* card, not just the native one.
 */
export async function shouldShowReviewPrompt(): Promise<boolean> {
  try {
    const state = await readState();
    if (state.promptCount >= MAX_PROMPTS) return false;
    if (daysSince(state.lastPromptAt) < MIN_DAYS_BETWEEN_PROMPTS) return false;
    return true;
  } catch {
    return false;
  }
}

export async function recordReviewPromptShown(): Promise<void> {
  const state = await readState();
  await writeState({ promptCount: state.promptCount + 1, lastPromptAt: new Date().toISOString() });
}

/**
 * The "Yes!" action on the gate. Platforms diverge on purpose:
 *  - iOS: Apple's own guidance treats choosing *when* to call SKStoreReviewController (e.g. only
 *    after a user says they're enjoying the app) as acceptable — you're not bypassing their system,
 *    just timing it. So this calls the real native prompt.
 *  - Android: Google explicitly prohibits asking any opinion question ("Do you like the app?")
 *    immediately before or after their in-app review card — so this gate can never trigger it.
 *    Instead "Yes" opens the Play Store listing directly, same as the Settings "Rate us" link.
 */
export async function confirmEnjoyingApp(): Promise<void> {
  if (Platform.OS === 'ios') {
    try {
      const available = await StoreReview.isAvailableAsync();
      const hasAction = available && (await StoreReview.hasAction());
      if (hasAction) {
        await StoreReview.requestReview();
        return;
      }
    } catch {
      /* fall through to the store listing link below */
    }
  }
  await openStoreListingForReview();
}
