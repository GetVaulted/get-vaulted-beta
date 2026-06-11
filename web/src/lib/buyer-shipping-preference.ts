import { marketplaceListingRateKey } from "@/lib/marketplace-shipping-offer";

const PREFERRED_RATE_KEY = "gv_buyer_preferred_shipping_rate_key";

export type CheckoutRatePick = {
  id: string;
  carrier: string;
  serviceLevel: string;
};

export function checkoutRatePreferenceKey(rate: Pick<CheckoutRatePick, "carrier" | "serviceLevel">): string {
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

export function getBuyerPreferredShippingRateKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFERRED_RATE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function setBuyerPreferredShippingRateKey(key: string): void {
  if (typeof window === "undefined") return;
  const trimmed = key.trim();
  if (!trimmed) return;
  try {
    window.localStorage.setItem(PREFERRED_RATE_KEY, trimmed);
  } catch {
    /* ignore */
  }
}
