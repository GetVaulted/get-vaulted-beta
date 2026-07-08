import { effectiveSellerPlatformFeePercentOverride } from "@/services/seller-platform-fee-override";

type SellerFeeOverrideFields = {
  sellerPlatformFeePercentOverride?: number | null;
  sellerPlatformFeeOverrideExpiresAt?: Date | null;
};

/** Resolve active override for seller sales reporting and payout estimates. */
export function sellerUserWithEffectivePlatformFeeOverride<T extends SellerFeeOverrideFields>(
  user: T,
): T & { sellerPlatformFeePercentOverride: number | null } {
  return {
    ...user,
    sellerPlatformFeePercentOverride: effectiveSellerPlatformFeePercentOverride({
      percent: user.sellerPlatformFeePercentOverride,
      expiresAt: user.sellerPlatformFeeOverrideExpiresAt,
    }),
  };
}

export const sellerPlatformFeeOverrideSelect = {
  sellerPlatformFeePercentOverride: true,
  sellerPlatformFeeOverrideExpiresAt: true,
} as const;
