import type { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchMyLiveRooms, type LiveRoomApiRow } from '../api/liveRoomsRepository';
import { fetchSellerAnalytics, type SellerAnalyticsSnapshot } from '../api/sellerAnalyticsRepository';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';
import { useSellerStripeConnect } from './useSellerStripeConnect';
import { useSellerLiveReadiness } from './useSellerLiveReadiness';
import { useSellerWallet } from './useSellerWallet';
import { isSellerHQApproved } from '../lib/sellerHubEntry';
import { resolveLiveSalesGate } from '../lib/sellerLiveReadiness';
import type { SellerLayawayCounts } from '../api/layawayRepository';
import type { SellerReloadOptions } from './sellerReloadOptions';

const EMPTY_ANALYTICS: SellerAnalyticsSnapshot = {
  activeListings: 0,
  pendingFulfillment: 0,
  completedSales: 0,
  completedTrades: 0,
  liveViewerTotal: 0,
  liveShowsLive: 0,
  followers: 0,
  averageRating: 0,
  reviewCount: 0,
  revenueAvailable: null,
};

export function useSellerCommandCenterData(
  accessToken: string | undefined,
  vaultListingCount: number,
  layawayCounts?: SellerLayawayCounts | null,
) {
  const sellerConnect = useSellerStripeConnect(accessToken);
  const liveReadiness = useSellerLiveReadiness(accessToken);
  const sellerWallet = useSellerWallet(accessToken);
  const [rooms, setRooms] = useState<LiveRoomApiRow[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsRefreshing, setRoomsRefreshing] = useState(false);
  const [roomsLoadedOnce, setRoomsLoadedOnce] = useState(false);
  const [analytics, setAnalytics] = useState<SellerAnalyticsSnapshot>(EMPTY_ANALYTICS);
  const roomsRequestRef = useRef(0);
  const roomsLoadedOnceRef = useRef(false);

  const reloadRooms = useCallback(async (opts?: SellerReloadOptions) => {
    if (!accessToken) {
      roomsRequestRef.current += 1;
      setRooms([]);
      setRoomsLoading(false);
      setRoomsRefreshing(false);
      setRoomsLoadedOnce(false);
      roomsLoadedOnceRef.current = false;
      return;
    }

    const requestId = ++roomsRequestRef.current;
    const silent = opts?.silent ?? roomsLoadedOnceRef.current;
    if (!silent) setRoomsLoading(true);

    try {
      const rows = await fetchMyLiveRooms(accessToken, { force: opts?.force });
      if (requestId !== roomsRequestRef.current) return;
      setRooms(rows);
      setRoomsLoadedOnce(true);
      roomsLoadedOnceRef.current = true;
    } catch {
      if (requestId !== roomsRequestRef.current) return;
      if (!roomsLoadedOnceRef.current) setRooms([]);
    } finally {
      if (requestId !== roomsRequestRef.current) return;
      if (!silent) setRoomsLoading(false);
    }
  }, [accessToken]);

  const reloadAnalytics = useCallback(
    async (userId: string) => {
      const snap = await fetchSellerAnalytics(
        userId,
        accessToken,
        sellerWallet.wallet?.availableFormatted ?? null,
      );
      setAnalytics(snap);
    },
    [accessToken, sellerWallet.wallet?.availableFormatted],
  );

  useEffect(() => {
    const task = deferAfterFirstPaint(() => {
      void reloadRooms();
    }, 300);
    return () => task.cancel();
  }, [reloadRooms]);

  const liveRoom = useMemo(() => rooms.find((r) => r.status === 'live') ?? null, [rooms]);
  const upcomingRooms = useMemo(
    () =>
      rooms
        .filter((r) => r.status === 'scheduled')
        .sort((a, b) => {
          const ta = a.scheduledStartAt ? new Date(a.scheduledStartAt).getTime() : 0;
          const tb = b.scheduledStartAt ? new Date(b.scheduledStartAt).getTime() : 0;
          return ta - tb;
        }),
    [rooms],
  );
  const approved = isSellerHQApproved(sellerConnect.status);
  const liveGate = useMemo(
    () =>
      resolveLiveSalesGate(
        sellerConnect.status,
        liveReadiness.readinessLoaded ? liveReadiness.readiness : null,
        {
          connectLoading: sellerConnect.loading && !sellerConnect.loadedOnce,
          readinessLoading: liveReadiness.loading && !liveReadiness.loadedOnce,
        },
      ),
    [
      sellerConnect.loading,
      sellerConnect.status,
      liveReadiness.loading,
      liveReadiness.readiness,
      liveReadiness.readinessLoaded,
    ],
  );
  const liveCount = liveRoom ? 1 : 0;

  const setupProgress = useMemo(() => {
    const st = sellerConnect.status;
    if (approved) return 1;
    if (!st) return 0.15;
    if (st.stripe_account_id?.trim()) return 0.65;
    if (st.stripeConfigured) return 0.45;
    return 0.25;
  }, [approved, sellerConnect.status]);

  const todayItems = useMemo(() => {
    const items: {
      id: string;
      icon: keyof typeof Ionicons.glyphMap;
      label: string;
      value: string;
      tone?: 'gold' | 'live' | 'warn';
    }[] = [];
    const eventCount = upcomingRooms.length + liveCount;
    if (eventCount > 0) {
      items.push({
        id: 'vault_events',
        icon: liveRoom ? 'radio-outline' : 'calendar-outline',
        label: 'Vault events',
        value: liveRoom
          ? `${eventCount} show${eventCount === 1 ? '' : 's'} · manage in Vault Events`
          : `${eventCount} scheduled · open Vault Events`,
        tone: liveRoom ? 'live' : 'gold',
      });
    }
    if (analytics.pendingFulfillment > 0) {
      items.push({
        id: 'ship',
        icon: 'cube-outline',
        label: 'Orders needing fulfillment',
        value: `${analytics.pendingFulfillment} awaiting ship`,
        tone: 'warn',
      });
    }
    const layawayActive = layawayCounts?.active ?? 0;
    if (layawayActive > 0) {
      items.push({
        id: 'layaways',
        icon: 'time-outline',
        label: 'Active layaways',
        value: `${layawayActive} reserved sale${layawayActive === 1 ? '' : 's'}`,
        tone: 'gold',
      });
    }
    if (analytics.followers > 0) {
      items.push({
        id: 'followers',
        icon: 'people-outline',
        label: 'Collector network',
        value: `${analytics.followers} follower${analytics.followers === 1 ? '' : 's'}`,
      });
    }
    if (sellerWallet.wallet?.pendingFormatted) {
      items.push({
        id: 'payout',
        icon: 'wallet-outline',
        label: 'Revenue vault · pending',
        value: sellerWallet.wallet.pendingFormatted,
        tone: 'gold',
      });
    }
    const drafts = Math.max(0, vaultListingCount - analytics.activeListings);
    if (drafts > 0) {
      items.push({
        id: 'drafts',
        icon: 'document-text-outline',
        label: 'Draft inventory',
        value: `${drafts} listing${drafts === 1 ? '' : 's'}`,
      });
    }
    if (analytics.completedSales > 0) {
      items.push({
        id: 'auction',
        icon: 'hammer-outline',
        label: 'Completed sales',
        value: `${analytics.completedSales} vault sale${analytics.completedSales === 1 ? '' : 's'}`,
      });
    }
    return items;
  }, [
    analytics.completedSales,
    analytics.followers,
    analytics.pendingFulfillment,
    liveCount,
    liveRoom,
    upcomingRooms.length,
    sellerWallet.wallet?.pendingFormatted,
    analytics.activeListings,
    vaultListingCount,
    layawayCounts?.active,
  ]);

  const fmt = (n: number | null) => (n == null ? '—' : String(n));

  return {
    approved,
    setupProgress,
    sellerConnect,
    liveReadiness,
    liveGate,
    sellerWallet,
    rooms,
    roomsLoading,
    roomsRefreshing,
    roomsLoadedOnce,
    reloadRooms,
    reloadAnalytics,
    liveRoom,
    upcomingRooms,
    todayItems,
    liveCount,
    upcomingCount: upcomingRooms.length,
    analytics,
    metrics: {
      revenueToday: analytics.revenueAvailable ?? sellerWallet.wallet?.availableFormatted ?? '—',
      activeCollectors: fmt(analytics.followers),
      pendingOrders: String(analytics.pendingFulfillment),
      performanceInsight:
        analytics.reviewCount > 0
          ? `${analytics.averageRating.toFixed(1)}★ · ${analytics.reviewCount} reviews`
          : 'Reviews unlock after completed deals',
      sellThrough:
        analytics.activeListings > 0
          ? `${analytics.completedSales} sold · ${analytics.activeListings} active`
          : '—',
      activeViewers: analytics.liveViewerTotal > 0 ? String(analytics.liveViewerTotal) : '—',
      conversion: analytics.liveShowsLive > 0 ? `${analytics.liveShowsLive} live` : '—',
      gmv: analytics.revenueAvailable ?? '—',
      avgHammer: analytics.completedTrades > 0 ? `${analytics.completedTrades} trades` : '—',
    },
  };
}
