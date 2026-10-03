import { applicationFeeCentsFromSubtotalUsd, platformFeeBaseUsd } from "@/lib/platform-fee-policy";
import { estimatePlatformFeeUsd, resolvePlatformFeePercentForSellerOrder } from "@/lib/seller-payout-estimate";

export type SellerPlatformFeeDisplay = {
  /** Platform fee in USD for seller UI ("Get Vaulted fee"). */
  platformFeeUsd: number;
  /** Platform fee in cents. */
  platformFeeCents: number;
  /** Percent applied (e.g. 6.75). */
  platformFeePercent: number;
  /** Fee basis in cents (item subtotal). */
  platformFeeBasisCents: number;
  /** platformFeeCents / platformFeeBasisCents * 100 when basis > 0. */
  effectivePercent: number;
  /** Where the fee came from. */
  source: "persisted" | "reconstructed";
};

/**
 * Seller-facing Get Vaulted fee. Prefer immutable charge-time columns on Order.
 * Never uses stripeApplicationFeeCents (may include processing), shipping, tax, or label clawbacks.
 */
export function resolveSellerPlatformFeeDisplay(args: {
  itemPriceUsd: number;
  isCompanyListing: boolean;
  platformFeeCents?: number | null;
  platformFeePercentApplied?: number | null;
  platformFeeBasisCents?: number | null;
  /** Fallback reconstruction only when persisted snapshot is missing. */
  liveShowId?: string | null;
  liveShowCompletedGmvUsd?: number | null;
  orderPaymentStatus?: string;
  sellerPlatformFeePercentOverride?: number | null;
}): SellerPlatformFeeDisplay {
  if (args.isCompanyListing) {
    const basis = Math.max(0, Math.round(platformFeeBaseUsd(args.itemPriceUsd) * 100));
    return {
      platformFeeUsd: 0,
      platformFeeCents: 0,
      platformFeePercent: 0,
      platformFeeBasisCents: basis,
      effectivePercent: 0,
      source: args.platformFeeCents != null ? "persisted" : "reconstructed",
    };
  }

  const hasPersisted =
    args.platformFeeCents != null &&
    Number.isFinite(args.platformFeeCents) &&
    args.platformFeePercentApplied != null &&
    Number.isFinite(args.platformFeePercentApplied) &&
    args.platformFeeBasisCents != null &&
    Number.isFinite(args.platformFeeBasisCents) &&
    args.platformFeeBasisCents > 0;

  if (hasPersisted) {
    const platformFeeCents = Math.max(0, Math.round(args.platformFeeCents!));
    const platformFeeBasisCents = Math.max(0, Math.round(args.platformFeeBasisCents!));
    const platformFeePercent = Math.max(0, args.platformFeePercentApplied!);
    const effectivePercent =
      platformFeeBasisCents > 0 ? (platformFeeCents / platformFeeBasisCents) * 100 : 0;
    return {
      platformFeeUsd: platformFeeCents / 100,
      platformFeeCents,
      platformFeePercent,
      platformFeeBasisCents,
      effectivePercent,
      source: "persisted",
    };
  }

  const platformFeePercent = resolvePlatformFeePercentForSellerOrder({
    isCompanyListing: false,
    liveShowId: args.liveShowId ?? null,
    liveShowCompletedGmvUsd: args.liveShowCompletedGmvUsd ?? null,
    orderItemPriceUsd: args.itemPriceUsd,
    orderPaymentStatus: args.orderPaymentStatus ?? "paid",
    sellerPlatformFeePercentOverride: args.sellerPlatformFeePercentOverride,
  });
  const basisUsd = platformFeeBaseUsd(args.itemPriceUsd);
  const platformFeeBasisCents = Math.max(0, Math.round(basisUsd * 100));
  const platformFeeCents = applicationFeeCentsFromSubtotalUsd(basisUsd, platformFeePercent);
  const platformFeeUsd = estimatePlatformFeeUsd({
    itemPriceUsd: args.itemPriceUsd,
    platformFeePercent,
  });
  const effectivePercent =
    platformFeeBasisCents > 0 ? (platformFeeCents / platformFeeBasisCents) * 100 : 0;

  return {
    platformFeeUsd,
    platformFeeCents,
    platformFeePercent,
    platformFeeBasisCents,
    effectivePercent,
    source: "reconstructed",
  };
}
