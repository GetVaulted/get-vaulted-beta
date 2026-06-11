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

export async function getBuyerPreferredShippingRateKey(): Promise<string | null> {
  try {
    const fromNative = await AsyncStorage.getItem(PREFERRED_RATE_KEY);
    if (fromNative?.trim()) return fromNative.trim();
  } catch {
    /* ignore */
  }
  try {
    const fromWeb = globalThis.localStorage?.getItem(PREFERRED_RATE_KEY);
    return fromWeb?.trim() || null;
  } catch {
    return null;
  }
}

export async function setBuyerPreferredShippingRateKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) return;
  try {
    await AsyncStorage.setItem(PREFERRED_RATE_KEY, trimmed);
  } catch {
    /* ignore */
  }
  try {
    globalThis.localStorage?.setItem(PREFERRED_RATE_KEY, trimmed);
  } catch {
    /* ignore */
  }
}
