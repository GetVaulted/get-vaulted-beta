import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { fetchHostConsole } from '../api/liveHostRepository';
import {
  createLiveRoomQueueItem,
  deleteLiveRoomQueueItem,
  patchLiveRoomItem,
  type LiveRoomItemRow,
} from '../api/liveRoomControlRepository';
import type { AddInventoryChoice } from '../components/seller/liveConsole/AddInventoryModal';
import type { AuctionPricingValues } from '../lib/liveAuctionPricing';
import { logSellerQueue } from '../lib/logSellerQueue';
import { logVaultCommandCenter } from '../lib/logVaultCommandCenterFlow';
import { sanitizeLiveError, type SanitizedLiveError } from '../components/seller/liveConsole/liveConsoleErrors';
import { DEFAULT_AUCTION_SEC } from '../components/seller/liveConsole/VaultPinnedLotCard';
import { openCreateListing } from '../navigation/openCreateListing';
import type { ChatMessage } from '../types';

export function useSellerLiveConsole({
  accessToken,
  roomId,
  roomStatus,
  roomType,
  sellerUsername,
  navigation,
  onBiddingUrgentChange,
  onAfterAddLot,
}: {
  accessToken: string;
  roomId: string;
  roomStatus: 'scheduled' | 'live' | 'ended';
  roomType: 'auction' | 'sale' | 'break';
  sellerUsername?: string | null;
  navigation: NavigationProp<ParamListBase>;
  onBiddingUrgentChange?: (urgent: boolean) => void;
  onAfterAddLot?: () => void;
}) {
  const [items, setItems] = useState<LiveRoomItemRow[]>([]);
  const [activeItem, setActiveItem] = useState<LiveRoomItemRow | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [serverNowMs, setServerNowMs] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [startingAuction, setStartingAuction] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [pricingEditItem, setPricingEditItem] = useState<LiveRoomItemRow | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [consoleError, setConsoleError] = useState<SanitizedLiveError | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const hydratedRef = useRef(false);

  const applyConsolePayload = useCallback(
    (data: Awaited<ReturnType<typeof fetchHostConsole>>) => {
      setItems(data.items);
      setActiveItem(data.activeItem);
      logSellerQueue('queue_length', {
        total: data.items.length,
        queued: data.items.filter((i) => i.status === 'queued').length,
      });
      logSellerQueue('active_item', {
        id: data.activeItem?.id ?? null,
        status: data.activeItem?.status ?? null,
      });
      setViewerCount(data.room.viewerCount);
      setServerNowMs(data.serverNowMs);
      const hostUser = sellerUsername?.trim().toLowerCase() ?? '';
      setChatMessages(
        data.messages
          .filter((m) => m.messageType !== 'bid')
          .map((m) => ({
            id: m.id,
            user: m.senderUsername,
            text: m.body,
            senderId: m.senderId,
            isHost: hostUser.length > 0 && m.senderUsername.toLowerCase() === hostUser,
            messageType: m.messageType,
          })),
      );
      hydratedRef.current = true;
      setConsoleError(null);
    },
    [sellerUsername],
  );

  const reload = useCallback(
    async (opts?: { soft?: boolean }) => {
      try {
        const data = await fetchHostConsole(accessToken, roomId);
        applyConsolePayload(data);
        return data;
      } catch (e) {
        const sanitized = sanitizeLiveError(e, 'console');
        logVaultCommandCenter('vault_sync_failed', {
          roomId,
          endpoint: 'GET /api/live-rooms/:id/host-console',
          userMessage: sanitized.userMessage,
          error: e instanceof Error ? e.message : String(e),
        });
        if (hydratedRef.current || opts?.soft) {
          setConsoleError(sanitized);
          return null;
        }
        throw e;
      }
    },
    [accessToken, applyConsolePayload, roomId],
  );

  useEffect(() => {
    hydratedRef.current = false;
  }, [roomId]);

  const loadOnce = useCallback(async () => {
    setLoading(true);
    setConsoleError(null);
    try {
      await reload();
    } catch (e) {
      setConsoleError(sanitizeLiveError(e, 'console'));
    } finally {
      setLoading(false);
    }
  }, [reload]);

  useEffect(() => {
    void loadOnce();
  }, [loadOnce]);

  useEffect(() => {
    if (roomStatus !== 'live') return;
    const id = setInterval(() => {
      void reload({ soft: true });
    }, 5000);
    return () => clearInterval(id);
  }, [reload, roomStatus]);

  const biddingUrgent = useMemo(() => {
    if (!activeItem?.biddingOpen || !activeItem.auctionEndsAt) return false;
    const end = Date.parse(activeItem.auctionEndsAt);
    return Number.isFinite(end) && end - serverNowMs < 8000;
  }, [activeItem, serverNowMs]);

  useEffect(() => {
    onBiddingUrgentChange?.(biddingUrgent);
  }, [biddingUrgent, onBiddingUrgentChange]);

  const run = async (fn: () => Promise<void>) => {
    if (busy || roomStatus === 'ended') return;
    setBusy(true);
    setConsoleError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      const sanitized = sanitizeLiveError(e, 'console');
      setConsoleError(sanitized);
      Alert.alert('Live room', sanitized.userMessage);
    } finally {
      setBusy(false);
    }
  };

  const onAddLot = (title: string, pricing?: AuctionPricingValues) => {
    const t = title.trim();
    if (!t) {
      Alert.alert('Title required', 'Name your lot for the vault queue.');
      return;
    }
    void run(async () => {
      await createLiveRoomQueueItem(accessToken, roomId, {
        title: t,
        quantity: pricing?.quantity ?? 1,
        startingBidUsd: pricing?.startingBidUsd ?? null,
        reservePriceUsd: pricing?.reservePriceUsd ?? null,
        priceUsd: pricing?.buyNowPriceUsd ?? null,
      });
      setQuickTitle('');
      setInventoryOpen(false);
      logSellerQueue('add_item_success', {
        title: t.slice(0, 80),
        quantity: pricing?.quantity ?? 1,
        startingBidUsd: pricing?.startingBidUsd ?? null,
      });
      onAfterAddLot?.();
    });
  };

  const onSaveQueuePricing = (itemId: string, pricing: AuctionPricingValues) => {
    void run(async () => {
      await patchLiveRoomItem(accessToken, roomId, itemId, {
        quantity: pricing.quantity,
        startingBidUsd: pricing.startingBidUsd,
        reservePriceUsd: pricing.reservePriceUsd,
        priceUsd: pricing.buyNowPriceUsd,
      });
      setPricingEditItem(null);
    });
  };

  const onInventorySelect = (id: AddInventoryChoice, pricing?: AuctionPricingValues) => {
    if (id === 'scan') {
      Alert.alert('Scan card', 'Card scanning is coming to your vault lane.');
      return;
    }
    if (id === 'marketplace') {
      setInventoryOpen(false);
      void openCreateListing(navigation, { channel: 'marketplace' });
      return;
    }
    if (id === 'live_show') {
      setInventoryOpen(false);
      void openCreateListing(navigation, { channel: 'live_show' });
      return;
    }
    onAddLot(quickTitle || 'Vault lot', pricing);
  };

  const onReorder = (ordered: LiveRoomItemRow[]) => {
    void run(async () => {
      await Promise.all(
        ordered.map((item, index) => patchLiveRoomItem(accessToken, roomId, item.id, { sortOrder: index })),
      );
    });
  };

  const onStartBidding = () => {
    if (!activeItem) return;
    void run(async () => {
      setStartingAuction(true);
      try {
        await patchLiveRoomItem(accessToken, roomId, activeItem.id, {
          action: 'startAuction',
          auctionDurationSec: DEFAULT_AUCTION_SEC,
          clutchTimeEnabled: false,
        });
      } finally {
        setStartingAuction(false);
      }
    });
  };

  const onSold = () => {
    if (!activeItem) return;
    void run(async () => {
      await patchLiveRoomItem(accessToken, roomId, activeItem.id, { status: 'sold' });
    });
  };

  const onSkip = () => {
    if (!activeItem) return;
    void run(async () => {
      await patchLiveRoomItem(accessToken, roomId, activeItem.id, { status: 'skipped' });
    });
  };

  const onExtend = () => {
    if (!activeItem?.biddingOpen) onStartBidding();
  };

  const onLaunch = (item: LiveRoomItemRow) => {
    void run(async () => {
      await patchLiveRoomItem(accessToken, roomId, item.id, { status: 'active' });
    });
  };

  const onLaunchAndStart = (item: LiveRoomItemRow) => {
    void run(async () => {
      await patchLiveRoomItem(accessToken, roomId, item.id, { status: 'active' });
      setStartingAuction(true);
      try {
        await patchLiveRoomItem(accessToken, roomId, item.id, {
          action: 'startAuction',
          auctionDurationSec: DEFAULT_AUCTION_SEC,
          clutchTimeEnabled: false,
        });
      } finally {
        setStartingAuction(false);
      }
    });
  };

  const onRemove = (item: LiveRoomItemRow) => {
    Alert.alert('Remove lot?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void run(async () => {
            await deleteLiveRoomQueueItem(accessToken, roomId, item.id);
          });
        },
      },
    ]);
  };

  const auctionRoom = roomType === 'auction' || roomType === 'break';
  const roomLive = roomStatus === 'live';
  const roomEnded = roomStatus === 'ended';
  const queuedCount = items.filter((i) => i.status === 'queued').length;

  return {
    items,
    activeItem,
    viewerCount,
    serverNowMs,
    loading,
    busy,
    startingAuction,
    inventoryOpen,
    setInventoryOpen,
    pricingEditItem,
    setPricingEditItem,
    onSaveQueuePricing,
    quickTitle,
    setQuickTitle,
    consoleError,
    chatMessages,
    loadOnce,
    onInventorySelect,
    onReorder,
    onStartBidding,
    onSold,
    onSkip,
    onExtend,
    onLaunch,
    onLaunchAndStart,
    onRemove,
    auctionRoom,
    roomLive,
    roomEnded,
    queuedCount,
    biddingUrgent,
  };
}
