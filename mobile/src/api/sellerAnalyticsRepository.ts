import { fetchMyLiveRooms } from './liveRoomsRepository';
import { isOrderCompleteForReview } from './ordersRepository';
import { fetchSellerAccount } from './sellerAccountRepository';
import { fetchSellerSalesOrders, type SellerSalesOrderRow } from './sellerSalesRepository';
import { fetchListingsBySeller } from './listingsFeedRepository';
import { fetchCompletedTradesForUser } from './tradeOffersRepository';
import { countAwaitingShipmentSales, isAwaitingShipmentSale } from '../lib/sellerAwaitingShipment';
import { followerCount } from '../platform/platformStore';
import { reviewStatsForUser } from '../platform/platformStore';

export type SellerRevenueDayPoint = {
  /** Short weekday label, e.g. "Mon" — the most recent point is labeled "Today". */
  dateLabel: string;
  totalCents: number;
};

export type SellerTopSale = {
  listingTitle: string;
  totalCents: number;
  channel: 'live' | 'marketplace';
  buyerUsername: string | null;
  /** True when this buyer has more than one paid order with this seller (any time). */
  isRepeatBuyer: boolean;
};

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
  /** Last 7 days of paid-order revenue, oldest first, ending today. */
  revenueByDay: SellerRevenueDayPoint[];
  revenueThisWeekCents: number;
  revenuePrevWeekCents: number;
  /** All-time average paid-order value. Null when there are no paid orders yet. */
  avgSaleCents: number | null;
  /** Average paid-order value per week for the last 5 rolling weeks, oldest first. */
  avgSaleWeeklyTrend: number[];
  /** completedSales / (completedSales + activeListings) as a whole percent. Null with no data. */
  sellThroughPercent: number | null;
  /** Highest paid order placed in the last 7 days, or null if none. */
  topSaleThisWeek: SellerTopSale | null;
  /** Hours since the oldest still-awaiting-shipment paid order was placed. Null if none awaiting. */
  oldestAwaitingShipHours: number | null;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 24 * 60 * 60 * 1000;

function isPaidRevenueOrder(o: Pick<SellerSalesOrderRow, 'paymentStatus' | 'status'>): boolean {
  if (o.paymentStatus !== 'paid') return false;
  const status = (o.status ?? '').toLowerCase();
  return status !== 'cancelled' && status !== 'canceled';
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function buildRevenueByDay(orders: SellerSalesOrderRow[], now: Date): SellerRevenueDayPoint[] {
  const todayStart = startOfDay(now);
  const buckets: SellerRevenueDayPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = todayStart - i * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    const totalCents = orders.reduce((sum, o) => {
      if (!isPaidRevenueOrder(o)) return sum;
      const t = new Date(o.createdAt).getTime();
      return t >= dayStart && t < dayEnd ? sum + o.totalCents : sum;
    }, 0);
    const label = i === 0 ? 'Today' : WEEKDAY_LABELS[new Date(dayStart).getDay()];
    buckets.push({ dateLabel: label, totalCents });
  }
  return buckets;
}

function sumPaidInWindow(orders: SellerSalesOrderRow[], now: Date, daysAgoStart: number, daysAgoEnd: number): number {
  const nowMs = now.getTime();
  const windowStart = nowMs - daysAgoStart * DAY_MS;
  const windowEnd = nowMs - daysAgoEnd * DAY_MS;
  return orders.reduce((sum, o) => {
    if (!isPaidRevenueOrder(o)) return sum;
    const t = new Date(o.createdAt).getTime();
    return t >= windowStart && t < windowEnd ? sum + o.totalCents : sum;
  }, 0);
}

function buildAvgSaleWeeklyTrend(orders: SellerSalesOrderRow[], now: Date): number[] {
  const nowMs = now.getTime();
  const trend: number[] = [];
  for (let w = 4; w >= 0; w--) {
    const windowEnd = nowMs - w * 7 * DAY_MS;
    const windowStart = windowEnd - 7 * DAY_MS;
    const weekOrders = orders.filter((o) => {
      if (!isPaidRevenueOrder(o)) return false;
      const t = new Date(o.createdAt).getTime();
      return t >= windowStart && t < windowEnd;
    });
    const avg =
      weekOrders.length > 0
        ? Math.round(weekOrders.reduce((s, o) => s + o.totalCents, 0) / weekOrders.length)
        : 0;
    trend.push(avg);
  }
  return trend;
}

function findTopSaleThisWeek(orders: SellerSalesOrderRow[], now: Date): SellerTopSale | null {
  const nowMs = now.getTime();
  const weekStart = nowMs - 7 * DAY_MS;
  const paid = orders.filter(isPaidRevenueOrder);
  const thisWeek = paid.filter((o) => new Date(o.createdAt).getTime() >= weekStart);
  if (thisWeek.length === 0) return null;

  const top = thisWeek.reduce((best, o) => (o.totalCents > best.totalCents ? o : best), thisWeek[0]);
  const buyerOrderCounts = new Map<string, number>();
  for (const o of paid) {
    const uname = o.buyerUsername?.trim();
    if (!uname) continue;
    buyerOrderCounts.set(uname, (buyerOrderCounts.get(uname) ?? 0) + 1);
  }
  const buyerUsername = top.buyerUsername?.trim() || null;

  return {
    listingTitle: top.listingTitle || 'Vault sale',
    totalCents: top.totalCents,
    channel: top.liveShowId ? 'live' : 'marketplace',
    buyerUsername,
    isRepeatBuyer: buyerUsername ? (buyerOrderCounts.get(buyerUsername) ?? 0) > 1 : false,
  };
}

function findOldestAwaitingShipHours(orders: SellerSalesOrderRow[], now: Date): number | null {
  const awaiting = orders.filter(isAwaitingShipmentSale);
  if (awaiting.length === 0) return null;
  const oldest = awaiting.reduce((min, o) => {
    const t = new Date(o.createdAt).getTime();
    return t < min ? t : min;
  }, new Date(awaiting[0].createdAt).getTime());
  return Math.max(0, Math.floor((now.getTime() - oldest) / (60 * 60 * 1000)));
}

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

  const now = new Date();
  const paidOrders = orders.filter(isPaidRevenueOrder);
  const avgSaleCents =
    paidOrders.length > 0
      ? Math.round(paidOrders.reduce((s, o) => s + o.totalCents, 0) / paidOrders.length)
      : null;
  const activeListingsCount = myListings.length;
  const sellThroughDenom = completedSales + activeListingsCount;

  return {
    activeListings: activeListingsCount,
    pendingFulfillment,
    completedSales,
    completedTrades: trades.length,
    liveViewerTotal,
    liveShowsLive: liveRooms.length,
    followers,
    averageRating: stats.average,
    reviewCount: stats.count,
    revenueAvailable: walletAvailable ?? null,
    revenueByDay: buildRevenueByDay(orders, now),
    revenueThisWeekCents: sumPaidInWindow(orders, now, 7, 0),
    revenuePrevWeekCents: sumPaidInWindow(orders, now, 14, 7),
    avgSaleCents,
    avgSaleWeeklyTrend: buildAvgSaleWeeklyTrend(orders, now),
    sellThroughPercent: sellThroughDenom > 0 ? Math.round((completedSales / sellThroughDenom) * 100) : null,
    topSaleThisWeek: findTopSaleThisWeek(orders, now),
    oldestAwaitingShipHours: findOldestAwaitingShipHours(orders, now),
  };
}
