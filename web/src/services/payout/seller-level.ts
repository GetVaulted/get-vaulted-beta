import {
  InstantPayoutApprovalStatus,
  SellerLevel,
  SellerPayoutTier,
} from "@/generated/prisma/enums";

export const SELLER_LEVEL_LABELS: Record<SellerLevel, string> = {
  [SellerLevel.vault_seller]: "Vault Seller",
  [SellerLevel.trusted_seller]: "Trusted Seller",
  [SellerLevel.vault_verified]: "Vault Verified",
  [SellerLevel.elite_vault_verified]: "Elite Vault Verified",
};

export const SELLER_LEVEL_DESCRIPTIONS: Record<SellerLevel, string> = {
  [SellerLevel.vault_seller]: "Established seller on Get Vaulted.",
  [SellerLevel.trusted_seller]: "Proven fulfillment track record and trusted by the community.",
  [SellerLevel.vault_verified]: "Top-tier seller with verified standing on Get Vaulted.",
  [SellerLevel.elite_vault_verified]: "Hand-selected elite seller — the highest trust designation on Get Vaulted.",
};

/** Public-facing level derived from payout tier + instant approval; elite is admin-only. */
export function resolveSellerLevel(input: {
  payoutTier: SellerPayoutTier;
  instantPayoutApprovalStatus: InstantPayoutApprovalStatus;
  sellerLevelOverrideByAdmin: boolean;
  adminSellerLevel: SellerLevel;
}): SellerLevel {
  if (
    input.sellerLevelOverrideByAdmin &&
    input.adminSellerLevel === SellerLevel.elite_vault_verified
  ) {
    return SellerLevel.elite_vault_verified;
  }
  if (
    input.instantPayoutApprovalStatus === InstantPayoutApprovalStatus.approved ||
    input.payoutTier === SellerPayoutTier.instant
  ) {
    return SellerLevel.vault_verified;
  }
  if (input.payoutTier === SellerPayoutTier.fast) {
    return SellerLevel.trusted_seller;
  }
  return SellerLevel.vault_seller;
}

export function sellerLevelLabel(level: SellerLevel): string {
  return SELLER_LEVEL_LABELS[level] ?? "Vault Seller";
}
