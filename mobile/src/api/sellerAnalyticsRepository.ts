import { fetchMyLiveRooms } from './liveRoomsRepository';
import { isOrderCompleteForReview } from './ordersRepository';
import { fetchSellerAccount } from './sellerAccountRepository';
import { fetchSellerSalesOrders } from './sellerSalesRepository';
import { fetchListingsBySeller } from './listingsFeedRepository';
import { fetchCompletedTradesForUser } from './tradeOffersRepository';
import { countAwaitingShipmentSales } from '../lib/sellerAwaitingShipment';
import { followerCount } from '../platform/platformStore';
import { reviewStatsForUser } from '../platform/platformStore';

export type SellerAnalyticsSnapshot = {
  activeListings: number;
  pendingFulfillment: number;
  completedSales: number;
  completedTrades: number;
  liveViewerTotal: number;
  liveShowsLive: number;
  followers: number;
  averageRating: number;
  reviewCount: number;
  revenueAvailable: string | null;
};

export async function fetchSellerAnalytics(
  userId: string,
  accessToken?: string,
  walletAvailable?: string | null,
): Promise<SellerAnalyticsSnapshot> {
  const [orders, myListings, trades, stats, followers, rooms, sellerAccount] = await Promise.all([
    accessToken ? fetchSellerSalesOrders(accessToken) : Promise.resolve([]),
    fetchListingsBySeller({ sellerId: userId, limit: 100 }),
    fetchCompletedTradesForUser(userId),
    reviewStatsForUser(userId),
    followerCount(userId),
    accessToken ? fetchMyLiveRooms(accessToken) : Promise.resolve([]),
    accessToken
      ? fetchSellerAccount(accessToken).catch(() => null)
      : Promise.resolve(null),
  ]);
  // Prefer server hub count (same Prisma filter as web). Fall back to sales-list filter.
  const serverAwaiting = sellerAccount?.sellerHomeStats?.awaitingShipmentCount;
  const pendingFulfillment =
    typeof serverAwaiting === 'number' && Number.isFinite(serverAwaiting)
      ? Math.max(0, Math.floor(serverAwaiting))
      : countAwaitingShipmentSales(orders);
  const completedSales = orders.filter((o) => isOrderCompleteForReview(o.status)).length;
  const liveRooms = rooms.filter((r) => r.status === 'live');
  const liveViewerTotal = liveRooms.reduce((s, r) => s + (r.viewerCount ?? 0), 0);

  return {
    activeListings: myListings.length,
    pendingFulfillment,
    completedSales,
    completedTrades: trades.length,
    liveViewerTotal,
    liveShowsLive: liveRooms.length,
    followers,
    averageRating: stats.average,
    reviewCount: stats.count,
    revenueAvailable: walletAvailable ?? null,
  };
}
