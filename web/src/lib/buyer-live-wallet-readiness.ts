import { isStripeConfigured } from "@/lib/stripe";
import { buyerHasCardOnFileForLiveBidding } from "@/lib/stripe-customer";
import { resolveBuyerDefaultShippingForOrder } from "@/lib/live-buy-now-purchase";

/** At least one complete buyer shipping address on file (street, city, state, ZIP, contact phone). */
export async function buyerHasShippingAddressSaved(userId: string): Promise<boolean> {
  const shipping = await resolveBuyerDefaultShippingForOrder(userId);
  return shipping != null;
}

type WalletReadiness = { paymentReady: boolean; shippingReady: boolean };

/** Cache ready wallets for the show; incomplete clears immediately so setup is rechecked. */
const WALLET_READY_TTL_MS = 5 * 60_000;
const walletReadyCache = new Map<string, { at: number; value: WalletReadiness }>();

export function clearBuyerLiveWalletReadinessCache(userId?: string): void {
  if (userId) {
    walletReadyCache.delete(userId);
    return;
  }
  walletReadyCache.clear();
}

/**
 * When Stripe is off (local dev), both gates are relaxed — same behavior as `buyerHasCardOnFileForLiveBidding`.
 * In production, live buyers need a live-eligible saved payment method (card, Cash App, Link,
 * Amazon Pay, or vaulted Venmo) and a shipping address on their account (Wallet).
 */
export async function getBuyerLiveWalletReadiness(userId: string): Promise<WalletReadiness> {
  if (!isStripeConfigured()) {
    return { paymentReady: true, shippingReady: true };
  }
  const cached = walletReadyCache.get(userId);
  if (cached && Date.now() - cached.at < WALLET_READY_TTL_MS) {
    return cached.value;
  }
  const [paymentReady, shippingReady] = await Promise.all([
    buyerHasCardOnFileForLiveBidding(userId),
    buyerHasShippingAddressSaved(userId),
  ]);
  const value = { paymentReady, shippingReady };
  // Only cache a ready wallet — incomplete must recheck after the buyer updates Wallet.
  if (paymentReady && shippingReady) {
    walletReadyCache.set(userId, { at: Date.now(), value });
  } else {
    walletReadyCache.delete(userId);
  }
  return value;
}

export type LiveWalletIncompleteBody = {
  error: string;
  code: "LIVE_BUYER_WALLET_INCOMPLETE";
  paymentReady: boolean;
  shippingReady: boolean;
  addPaymentMethodsUrl: string;
  addShippingUrl: string;
};

export async function liveWalletIncompleteOrNull(userId: string): Promise<LiveWalletIncompleteBody | null> {
  const { paymentReady, shippingReady } = await getBuyerLiveWalletReadiness(userId);
  if (paymentReady && shippingReady) return null;
  // Incomplete → drop cache so the next check after wallet setup is fresh.
  clearBuyerLiveWalletReadinessCache(userId);
  const missing: string[] = [];
  if (!paymentReady) missing.push("saved payment method");
  if (!shippingReady) missing.push("shipping address with contact phone");
  return {
    error: `Add ${missing.join(" and ")} to your Wallet before bidding, buying, or claiming spots in live shows.`,
    code: "LIVE_BUYER_WALLET_INCOMPLETE",
    paymentReady,
    shippingReady,
    addPaymentMethodsUrl: "/account/payment-methods",
    addShippingUrl: "/account/payment-methods#wallet-shipping",
  };
}
