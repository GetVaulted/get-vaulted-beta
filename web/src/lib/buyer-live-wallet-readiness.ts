import { isStripeConfigured } from "@/lib/stripe";
import { buyerHasCardOnFileForLiveBidding } from "@/lib/stripe-customer";
import { resolveBuyerDefaultShippingForOrder } from "@/lib/live-buy-now-purchase";

/** At least one complete buyer shipping address on file (street, city, state, ZIP). */
export async function buyerHasShippingAddressSaved(userId: string): Promise<boolean> {
  const shipping = await resolveBuyerDefaultShippingForOrder(userId);
  return shipping != null;
}

/**
 * When Stripe is off (local dev), both gates are relaxed — same behavior as `buyerHasCardOnFileForLiveBidding`.
 * In production, live buyers need a saved card and a shipping address on their account (Wallet).
 */
export async function getBuyerLiveWalletReadiness(userId: string): Promise<{
  paymentReady: boolean;
  shippingReady: boolean;
}> {
  if (!isStripeConfigured()) {
    return { paymentReady: true, shippingReady: true };
  }
  const [paymentReady, shippingReady] = await Promise.all([
    buyerHasCardOnFileForLiveBidding(userId),
    buyerHasShippingAddressSaved(userId),
  ]);
  return { paymentReady, shippingReady };
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
  const missing: string[] = [];
  if (!paymentReady) missing.push("saved payment method");
  if (!shippingReady) missing.push("shipping address");
  return {
    error: `Add ${missing.join(" and ")} to your Wallet before bidding, buying, or claiming spots in live shows.`,
    code: "LIVE_BUYER_WALLET_INCOMPLETE",
    paymentReady,
    shippingReady,
    addPaymentMethodsUrl: "/account/payment-methods",
    addShippingUrl: "/account/payment-methods#wallet-shipping",
  };
}
