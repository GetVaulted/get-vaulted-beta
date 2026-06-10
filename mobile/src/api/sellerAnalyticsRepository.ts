import { fetchMyLiveRooms } from './liveRoomsRepository';
import { isOrderCompleteForReview } from './ordersRepository';
import { fetchSellerSalesOrders } from './sellerSalesRepository';
import { fetchListingsBySeller } from './listingsFeedRepository';
import { fetchCompletedTradesForUser } from './tradeOffersRepository';
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
  const [orders, myListings, trades, stats, followers, rooms] = await Promise.all([
    accessToken ? fetchSellerSalesOrders(accessToken) : Promise.resolve([]),
    fetchListingsBySeller({ sellerId: userId, limit: 100 }),
    fetchCompletedTradesForUser(userId),
    reviewStatsForUser(userId),
    followerCount(userId),
    accessToken ? fetchMyLiveRooms(accessToken) : Promise.resolve([]),
  ]);
  const pendingFulfillment = orders.filter(
    (o) =>
      (o.paymentStatus === 'paid' || o.status === 'paid' || o.status === 'shipped') &&
      o.paymentStatus !== 'layaway_active',
  ).length;
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
