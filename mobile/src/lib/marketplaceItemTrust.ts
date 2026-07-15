import type { Product } from '../types';
import { resolvePublicSellerLevelLabel } from './sellerLevelBadge';

export type ItemTrustMetrics = {
  sellerLevel: string | null;
  completedSales: string;
  accountStanding: string;
  authenticationStatus: string;
};

/**
 * Mirrors web `buildItemTrustMetrics` — only real backend signals.
 * Never invent sales / response / ship-on-time percentages from username hashes.
 */
export function buildProductTrustMetrics(product: Product): ItemTrustMetrics {
  const sales =
    typeof product.sellerCompletedOrderCount === 'number' &&
    Number.isFinite(product.sellerCompletedOrderCount) &&
    product.sellerCompletedOrderCount > 0
      ? Math.floor(product.sellerCompletedOrderCount)
      : null;
  const salesLabel = sales != null ? sales.toLocaleString('en-US') : 'New';
  const levelLabel = resolvePublicSellerLevelLabel(product.sellerLevel, product.sellerLevelLabel);

  const accountStanding =
    product.sellerLevel === 'elite_vault_verified' || product.sellerLevel === 'vault_verified'
      ? 'Excellent'
      : product.sellerLevel === 'trusted_seller'
        ? 'Very good'
        : sales != null && sales >= 250
          ? 'Excellent'
          : sales != null && sales >= 50
            ? 'Good'
            : 'Established';

  const isVerifiedSellerLevel =
    product.sellerLevel === 'vault_verified' || product.sellerLevel === 'elite_vault_verified';
  const authenticationStatus = product.conditionGrade?.match(/^(PSA|BGS|SGC)/i)
    ? 'Graded item'
    : isVerifiedSellerLevel
      ? 'Vault verified'
      : 'Ask seller';

  return {
    sellerLevel: levelLabel,
    completedSales: salesLabel,
    accountStanding,
    authenticationStatus,
  };
}
