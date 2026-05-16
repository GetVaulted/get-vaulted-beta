import type { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyLiveRooms, type LiveRoomApiRow } from '../api/liveRoomsRepository';
import { useSellerStripeConnect } from './useSellerStripeConnect';
import { useSellerWallet } from './useSellerWallet';
import { listingCounts, orderCounts, analyticsSnapshot } from '../data/sellerHubMock';
import { isSellerHQApproved } from '../lib/sellerHubEntry';

function formatCountdown(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = t - Date.now();
  if (diff <= 0) return 'Starting soon';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 48) return `${Math.floor(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function useSellerCommandCenterData(accessToken: string | undefined, vaultListingCount: number) {
  const sellerConnect = useSellerStripeConnect(accessToken);
  const sellerWallet = useSellerWallet(accessToken);
  const [rooms, setRooms] = useState<LiveRoomApiRow[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);

  const reloadRooms = useCallback(async () => {
    if (!accessToken) {
      setRooms([]);
      return;
    }
    setRoomsLoading(true);
    try {
      const rows = await fetchMyLiveRooms(accessToken);
      setRooms(rows);
    } catch {
      setRooms([]);
    } finally {
      setRoomsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void reloadRooms();
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
  const nextEvent = upcomingRooms[0] ?? null;

  const approved = isSellerHQApproved(sellerConnect.status);

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
    if (nextEvent) {
      items.push({
        id: 'countdown',
        icon: 'timer-outline',
        label: 'Vault event countdown',
        value: `${nextEvent.title} · ${formatCountdown(nextEvent.scheduledStartAt) ?? 'Scheduled'}`,
        tone: 'gold',
      });
    }
    if (orderCounts.ship > 0) {
      items.push({
        id: 'ship',
        icon: 'cube-outline',
        label: 'Orders needing fulfillment',
        value: `${orderCounts.ship} awaiting ship`,
        tone: 'warn',
      });
    }
    items.push({
      id: 'followers',
      icon: 'people-outline',
      label: 'Collector network',
      value: 'Growing · insights soon',
    });
    if (sellerWallet.wallet?.pendingFormatted) {
      items.push({
        id: 'payout',
        icon: 'wallet-outline',
        label: 'Revenue vault · pending',
        value: sellerWallet.wallet.pendingFormatted,
        tone: 'gold',
      });
    }
    const drafts = listingCounts.drafts + Math.max(0, vaultListingCount - listingCounts.active);
    if (drafts > 0) {
      items.push({
        id: 'drafts',
        icon: 'document-text-outline',
        label: 'Draft inventory',
        value: `${drafts} listing${drafts === 1 ? '' : 's'}`,
      });
    }
    items.push({
      id: 'auction',
      icon: 'hammer-outline',
      label: 'Auction performance',
      value: analyticsSnapshot.sellThrough === '—' ? 'Syncing lane metrics' : analyticsSnapshot.sellThrough,
    });
    return items;
  }, [nextEvent, sellerWallet.wallet?.pendingFormatted, vaultListingCount]);

  return {
    approved,
    setupProgress,
    sellerConnect,
    sellerWallet,
    rooms,
    roomsLoading,
    reloadRooms,
    liveRoom,
    upcomingRooms,
    nextEvent,
    todayItems,
    metrics: {
      revenueToday: sellerWallet.wallet?.availableFormatted ?? '—',
      followers: '—',
      pendingOrders: String(orderCounts.ship),
      upcomingShows: String(upcomingRooms.length + (liveRoom ? 1 : 0)),
      liveStatus: liveRoom ? 'On air' : 'Offline',
      sellThrough: analyticsSnapshot.sellThrough,
      activeViewers: analyticsSnapshot.viewerGrowth,
      conversion: analyticsSnapshot.engagement,
      gmv: analyticsSnapshot.revenue30,
      avgHammer: '—',
    },
  };
}
