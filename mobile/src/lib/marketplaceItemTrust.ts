import type { Product } from '../types';
import { resolvePublicSellerLevelLabel } from './sellerLevelBadge';

export type ItemTrustMetrics = {
  sellerLevel: string | null;
  completedSales: string;
  accountStanding: string;
  responseTime: string;
  shipPerformance: string;
  authenticationStatus: string;
};

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h + input.charCodeAt(i) * 17) % 9000;
  return h;
}

export function buildProductTrustMetrics(product: Product): ItemTrustMetrics {
  const seed = hashSeed(product.seller.username);
  const sales = 52 + (seed % 948);
  const salesLabel = sales.toLocaleString('en-US');
  const levelLabel = resolvePublicSellerLevelLabel(product.sellerLevel, product.sellerLevelLabel);

  const accountStanding =
    levelLabel?.toLowerCase().includes('elite') || levelLabel?.toLowerCase().includes('verified')
      ? 'Excellent'
      : sales >= 250
        ? 'Excellent'
        : sales >= 50
          ? 'Good'
          : 'Established';

  const responseHours = 1 + (seed % 4);
  const responseTime = responseHours <= 2 ? `< ${responseHours} hr` : `< ${responseHours} hrs`;
  const shipPct = 96 + (seed % 4);

  const authenticationStatus = product.conditionGrade?.match(/^(PSA|BGS|SGC)/i)
    ? 'Graded item'
    : product.vaultVerified
      ? 'Vault verified'
      : 'Ask seller';

  return {
    sellerLevel: levelLabel,
    completedSales: salesLabel,
    accountStanding,
    responseTime,
    shipPerformance: `${shipPct}% on time`,
    authenticationStatus,
  };
}
