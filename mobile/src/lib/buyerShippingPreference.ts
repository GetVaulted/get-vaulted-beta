import AsyncStorage from '@react-native-async-storage/async-storage';
import { marketplaceListingRateKey } from '../createListing/shippoRates';

const PREFERRED_RATE_KEY = 'gv_buyer_preferred_shipping_rate_key';

export type CheckoutRatePick = {
  id: string;
  carrier: string;
  serviceLevel: string;
};

export function checkoutRatePreferenceKey(rate: Pick<CheckoutRatePick, 'carrier' | 'serviceLevel'>): string {
  return marketplaceListingRateKey(rate);
}

/** Prefer saved carrier/service when seller offers it; otherwise cheapest (first) quote. */
export function pickCheckoutShippingRate<T extends CheckoutRatePick>(
  rates: T[],
  preferredKey: string | null | undefined,
): T | null {
  if (rates.length === 0) return null;
  const key = preferredKey?.trim();
  if (key) {
    const match = rates.find((r) => checkoutRatePreferenceKey(r) === key);
    if (match) return match;
  }
  return rates[0] ?? null;
}

/** Scoped per user so a new account on the same device never inherits a prior account's preferred
 * shipping carrier/service (cross-account data-leak audit, 2026-07). */
function scopedPreferredRateKey(userId: string): string {
  return `${PREFERRED_RATE_KEY}:${userId}`;
}

/**
 * One-time migration for existing users: this preference used to be stored device-wide under
 * `PREFERRED_RATE_KEY`. Unlike the seller wizard flags (a setup-gate/privacy concern), a wrongly
 * migrated shipping preference is low stakes — worst case someone has to re-pick their preferred
 * carrier once — so we use a simple "first reader claims it, then clear the legacy key" migration
 * rather than the more conservative bounded approach used for the seller wizard flags.
 */
async function migrateLegacyNativeRate(storageKey: string): Promise<string | null> {
  try {
    const legacy = await AsyncStorage.getItem(PREFERRED_RATE_KEY);
    const trimmed = legacy?.trim();
    if (!trimmed) return null;
    await AsyncStorage.setItem(storageKey, trimmed);
    await AsyncStorage.removeItem(PREFERRED_RATE_KEY);
    return trimmed;
  } catch {
    return null;
  }
}

function migrateLegacyWebRate(storageKey: string): string | null {
  try {
    const legacy = globalThis.localStorage?.getItem(PREFERRED_RATE_KEY);
    const trimmed = legacy?.trim();
    if (!trimmed) return null;
    globalThis.localStorage?.setItem(storageKey, trimmed);
    globalThis.localStorage?.removeItem(PREFERRED_RATE_KEY);
    return trimmed;
  } catch {
    return null;
  }
}

export async function getBuyerPreferredShippingRateKey(userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  const storageKey = scopedPreferredRateKey(userId);
  try {
    const fromNative = await AsyncStorage.getItem(storageKey);
    if (fromNative?.trim()) return fromNative.trim();
    const migratedNative = await migrateLegacyNativeRate(storageKey);
    if (migratedNative) return migratedNative;
  } catch {
    /* ignore */
  }
  try {
    const fromWeb = globalThis.localStorage?.getItem(storageKey);
    if (fromWeb?.trim()) return fromWeb.trim();
    return migrateLegacyWebRate(storageKey);
  } catch {
    return null;
  }
}

export async function setBuyerPreferredShippingRateKey(userId: string | undefined, key: string): Promise<void> {
  if (!userId) return;
  const trimmed = key.trim();
  if (!trimmed) return;
  const storageKey = scopedPreferredRateKey(userId);
  try {
    await AsyncStorage.setItem(storageKey, trimmed);
  } catch {
    /* ignore */
  }
  try {
    globalThis.localStorage?.setItem(storageKey, trimmed);
  } catch {
    /* ignore */
  }
}

/** Best-effort cleanup on sign-out — the per-user key scoping above is the primary fix, this is
 * defense-in-depth so no stale entry lingers under a signed-out user's id. */
export async function clearBuyerPreferredShippingRateKey(userId: string | undefined): Promise<void> {
  if (!userId) return;
  const storageKey = scopedPreferredRateKey(userId);
  try {
    await AsyncStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
  try {
    globalThis.localStorage?.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}
