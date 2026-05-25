import { marketplacePlatformFeePercent } from "@/lib/platform-fee-policy";
import {
  completedLiveShowGmvBeforeSale,
  liveShowPlatformFeePercent,
  resolvePlatformFeePercentForCheckout,
} from "@/lib/platform-fee-policy";

/** Estimated seller net on an order (excludes tips; platform fee on item only). */
export function estimateSellerOrderPayoutUsd(args: {
  itemPriceUsd: number;
  payoutReserveAmountCents: number;
  platformFeePercent?: number;
  shippingPriceUsd?: number;
}): number {
  const feePct = args.platformFeePercent ?? marketplacePlatformFeePercent();
  const item = Math.max(0, args.itemPriceUsd);
  const feeUsd = (item * feePct) / 100;
  const reserveUsd = Math.max(0, args.payoutReserveAmountCents) / 100;
  const shippingUsd = Math.max(0, args.shippingPriceUsd ?? 0);
  // Platform fee on item only; shipping pass-through; Stripe processing deducted separately by Stripe.
  return Math.max(0, Math.round((item - feeUsd - reserveUsd + shippingUsd) * 100) / 100);
}

export function resolvePlatformFeePercentForSellerOrder(args: {
  isCompanyListing: boolean;
  liveShowId: string | null;
  liveShowCompletedGmvUsd: number | null;
  orderItemPriceUsd: number;
  orderPaymentStatus: string;
}): number {
  if (args.isCompanyListing) return 0;
  if (!args.liveShowId) return marketplacePlatformFeePercent();
  const currentGmv = args.liveShowCompletedGmvUsd ?? 0;
  const gmvForTier =
    args.orderPaymentStatus === "paid"
      ? completedLiveShowGmvBeforeSale(currentGmv, args.orderItemPriceUsd)
      : currentGmv;
  return resolvePlatformFeePercentForCheckout({
    isCompanyListing: false,
    liveRoomId: args.liveShowId,
    completedLiveShowGmvUsd: gmvForTier,
  });
}

export function sellerInstantPayoutBannerMessage(args: {
  instantPayoutEligible: boolean;
  instantPayoutStatus: string;
}): string {
  const statusLabel = args.instantPayoutStatus.replace(/_/g, " ");
  if (args.instantPayoutEligible) {
    return `You are eligible for instant payout after carrier delivery confirmation (${statusLabel}).`;
  }
  if (args.instantPayoutStatus === "suspended") {
    return `Instant payout is suspended on your account. Standard payout holds apply after delivery (${statusLabel}).`;
  }
  if (args.instantPayoutStatus === "admin_override") {
    return `Instant payout was enabled by admin review. Funds release after delivery confirmation.`;
  }
  return `Instant payout is not enabled yet (${statusLabel}). Complete seller setup, verify Stripe payouts, and maintain tracking compliance. Standard payout holds apply after delivery.`;
}
