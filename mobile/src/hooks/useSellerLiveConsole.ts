import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { fetchHostConsole } from '../api/liveHostRepository';
import {
  createLiveRoomQueueItem,
  deleteLiveRoomQueueItem,
  patchLiveRoomItem,
  type LiveRoomItemRow,
} from '../api/liveRoomControlRepository';
import type { AddInventoryChoice } from '../components/seller/liveConsole/AddInventoryModal';
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
}: {
  accessToken: string;
  roomId: string;
  roomStatus: 'scheduled' | 'live' | 'ended';
  roomType: 'auction' | 'sale' | 'break';
  sellerUsername?: string | null;
  navigation: NavigationProp<ParamListBase>;
  onBiddingUrgentChange?: (urgent: boolean) => void;
}) {
  const [items, setItems] = useState<LiveRoomItemRow[]>([]);
  const [activeItem, setActiveItem] = useState<LiveRoomItemRow | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [serverNowMs, setServerNowMs] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [consoleError, setConsoleError] = useState<SanitizedLiveError | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const reload = useCallback(async () => {
    const data = await fetchHostConsole(accessToken, roomId);
    setItems(data.items);
    setActiveItem(data.activeItem);
    setViewerCount(data.room.viewerCount);
    setServerNowMs(data.serverNowMs);
    const hostUser = sellerUsername?.trim().toLowerCase() ?? '';
    setChatMessages(
      data.messages.map((m) => ({
        id: m.id,
        user: m.senderUsername,
        text: m.body,
        isHost: hostUser.length > 0 && m.senderUsername.toLowerCase() === hostUser,
      })),
    );
    return data;
  }, [accessToken, roomId, sellerUsername]);

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
      void reload().catch(() => undefined);
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

  const onAddLot = (title: string) => {
    const t = title.trim();
    if (!t) {
      Alert.alert('Title required', 'Name your lot for the vault queue.');
      return;
    }
    void run(async () => {
      await createLiveRoomQueueItem(accessToken, roomId, { title: t });
      setQuickTitle('');
      setInventoryOpen(false);
    });
  };

  const onInventorySelect = (id: AddInventoryChoice) => {
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
    onAddLot(quickTitle || 'Vault lot');
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
      await patchLiveRoomItem(accessToken, roomId, activeItem.id, {
        action: 'startAuction',
        auctionDurationSec: DEFAULT_AUCTION_SEC,
        clutchTimeEnabled: false,
      });
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
    inventoryOpen,
    setInventoryOpen,
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
    onRemove,
    auctionRoom,
    roomLive,
    roomEnded,
    queuedCount,
    biddingUrgent,
  };
}
