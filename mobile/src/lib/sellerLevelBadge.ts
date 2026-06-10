export type PublicSellerLevel =
  | 'vault_seller'
  | 'trusted_seller'
  | 'vault_verified'
  | 'elite_vault_verified';

const PUBLIC_LEVEL_LABELS: Record<PublicSellerLevel, string> = {
  vault_seller: 'Vault Seller',
  trusted_seller: 'Trusted Seller',
  vault_verified: 'Vault Verified',
  elite_vault_verified: 'Elite Vault Verified',
};

function isPublicSellerLevel(level: string): level is PublicSellerLevel {
  return level in PUBLIC_LEVEL_LABELS;
}

/** Buyer-facing seller badge only — never internal payout / verification tiers. */
export function resolvePublicSellerLevelLabel(
  level?: string | null,
  label?: string | null,
): string | null {
  const trimmedLabel = label?.trim();
  if (trimmedLabel) {
    if (/standard/i.test(trimmedLabel) && /verif/i.test(trimmedLabel)) return null;
    if (/payout/i.test(trimmedLabel)) return null;
    return trimmedLabel;
  }

  if (!level || !isPublicSellerLevel(level)) return null;
  return PUBLIC_LEVEL_LABELS[level];
}
