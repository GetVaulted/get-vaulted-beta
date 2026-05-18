import { countCompletedSalesForSeller } from '../api/ordersRepository';
import { fetchCompletedTradesForUser } from '../api/tradeOffersRepository';
import type { TrustProfile } from './trustTypes';
import { listDisputes, listReviewsForUser, reviewStatsForUser } from './platformStore';

export async function computeTrustProfile(
  userId: string,
  opts?: { completedSales?: number; completedTrades?: number; vaultVerified?: boolean },
): Promise<TrustProfile> {
  const [stats, reviews, disputes] = await Promise.all([
    reviewStatsForUser(userId),
    listReviewsForUser(userId),
    listDisputes(userId),
  ]);

  const [apiSales, apiTrades] = await Promise.all([
    countCompletedSalesForSeller(userId),
    fetchCompletedTradesForUser(userId),
  ]);
  const completedTrades = opts?.completedTrades ?? apiTrades.length;
  const completedSales =
    opts?.completedSales ??
    Math.max(apiSales, reviews.filter((r) => r.reviewType === 'buyer_to_seller').length);
  const disputeCount = disputes.length;
  const totalDeals = Math.max(1, completedTrades + completedSales);
  const disputeRate = Math.round((disputeCount / totalDeals) * 1000) / 10;

  let trustedTraderTier: TrustProfile['trustedTraderTier'] = 'none';
  if (stats.average >= 4.8 && completedTrades >= 10) trustedTraderTier = 'vault';
  else if (stats.average >= 4.5 && completedTrades >= 5) trustedTraderTier = 'gold';
  else if (stats.average >= 4.2 && completedTrades >= 3) trustedTraderTier = 'silver';
  else if (completedTrades >= 1) trustedTraderTier = 'bronze';

  const collectorScore = Math.min(
    100,
    Math.round(stats.average * 12 + completedTrades * 3 + completedSales * 2 - disputeRate * 2),
  );

  const responseRate = Math.min(99, 70 + Math.round(stats.average * 6) + Math.min(completedSales, 20));
  const shipSpeedScore = Math.min(99, 65 + Math.round(stats.average * 7) + Math.min(completedSales, 15));

  return {
    userId,
    successfulSales: completedSales,
    successfulTrades: completedTrades,
    disputeCount,
    disputeRate,
    responseRate,
    shipSpeedScore,
    vaultVerified: opts?.vaultVerified ?? false,
    trustedTraderTier,
    breakerReputation: Math.round(stats.average * 20),
    collectorScore,
    averageRating: stats.average,
    reviewCount: stats.count,
  };
}
