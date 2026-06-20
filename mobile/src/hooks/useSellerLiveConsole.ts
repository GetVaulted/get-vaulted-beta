import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { LiveGiveawayRow } from '../api/liveGiveawayRepository';
import { fetchHostConsole } from '../api/liveHostRepository';
import {
  createLiveRoomQueueItem,
  deleteLiveRoomQueueItem,
  patchLiveItemVariants,
  patchLiveRoomItem,
  type LiveRoomItemRow,
} from '../api/liveRoomControlRepository';
import type { QuickLiveLotSubmitPayload, QuickLiveLotSubmitOptions } from '../components/seller/liveConsole/AddInventoryModal';
import type { QuickLiveLotValues } from '../lib/liveAuctionPricing';
import type { LiveBreakVariantDraft } from '../lib/liveBreakPresets';
import { isVariantSalesFormat } from '../lib/liveItemVariant';
import { logSellerQueue } from '../lib/logSellerQueue';
import { logVaultCommandCenter } from '../lib/logVaultCommandCenterFlow';
import { sanitizeLiveError, type SanitizedLiveError } from '../components/seller/liveConsole/liveConsoleErrors';
import { mergeLiveRoomItemsById } from '../lib/mergeLiveRoomItems';
import { mergeRandomSpotClaimIntoItem, type RandomSpotClaim } from '../lib/liveVariantSpotBoard';
import { DEFAULT_AUCTION_SEC } from '../components/seller/liveConsole/VaultPinnedLotCard';
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
  const [giveaways, setGiveaways] = useState<LiveGiveawayRow[]>([]);
  const [activeItem, setActiveItem] = useState<LiveRoomItemRow | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [serverNowMs, setServerNowMs] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [startingAuction, setStartingAuction] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [pricingEditItem, setPricingEditItem] = useState<LiveRoomItemRow | null>(null);
  const [consoleError, setConsoleError] = useState<SanitizedLiveError | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const hydratedRef = useRef(false);
  const sellerUsernameRef = useRef(sellerUsername);
  sellerUsernameRef.current = sellerUsername;

  const applyConsolePayload = useCallback(
    (data: Awaited<ReturnType<typeof fetchHostConsole>>) => {
      setItems((prev) => mergeLiveRoomItemsById(prev, data.items));
      setGiveaways(data.giveaways);
      setActiveItem((prev) => {
        const next = data.activeItem ?? prev;
        if (!next) return null;
        if (!prev) return next;
        return mergeLiveRoomItemsById([prev], [next])[0] ?? next;
      });
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
      const hostUser = sellerUsernameRef.current?.trim().toLowerCase() ?? '';
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
    [],
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
    setLoading(true);
    setConsoleError(null);
    void reload().finally(() => setLoading(false));
  }, [roomId, reload]);

  useEffect(() => {
    if (roomStatus !== 'live') return;
    const id = setInterval(() => {
      void reload({ soft: true });
    }, 5000);
    return () => clearInterval(id);
  }, [reload, roomStatus]);

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

  const refreshConsole = useCallback(async () => {
    try {
      await reload({ soft: true });
    } catch {
      /* keep last synced console state */
    }
  }, [reload]);

  const recordRandomSpotClaim = useCallback((itemId: string, claim: RandomSpotClaim) => {
    const apply = (item: LiveRoomItemRow | null) => {
      if (!item || item.id !== itemId) return item;
      return mergeRandomSpotClaimIntoItem(item, claim);
    };
    setItems((prev) => prev.map((item) => apply(item) ?? item));
    setActiveItem((prev) => apply(prev));
  }, []);

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

  const onQuickAddLot = (payload: QuickLiveLotSubmitPayload, options?: QuickLiveLotSubmitOptions) => {
    if (busy || roomStatus === 'ended') return;
    setBusy(true);
    setConsoleError(null);
    void (async () => {
      try {
        await createLiveRoomQueueItem(accessToken, roomId, {
          title: payload.title,
          imageUrl: payload.imageUrl,
          salesFormat: payload.salesFormat,
          quantity: payload.quantity,
          startingBidUsd: payload.startingBidUsd,
          reservePriceUsd: payload.reservePriceUsd,
          priceUsd: payload.priceUsd,
          variants: payload.variants,
          variantAssignmentMode: payload.variantAssignmentMode,
        });
        logSellerQueue('add_item_success', {
          title: payload.title.slice(0, 80),
          quantity: payload.quantity,
          salesFormat: payload.salesFormat,
          variantCount: payload.variants?.length ?? 0,
          startingBidUsd: payload.startingBidUsd,
          reservePriceUsd: payload.reservePriceUsd,
          priceUsd: payload.priceUsd,
        });
        await reload();
        if (!options?.addAnother) setInventoryOpen(false);
        onAfterAddLot?.();
      } catch (e) {
        const sanitized = sanitizeLiveError(e, 'console');
        setConsoleError(sanitized);
        Alert.alert('Add to show', sanitized.userMessage);
      } finally {
        setBusy(false);
      }
    })();
  };

  const onSaveQueuePricing = (itemId: string, values: QuickLiveLotValues) => {
    void run(async () => {
      await patchLiveRoomItem(accessToken, roomId, itemId, {
        quantity: values.quantity,
        startingBidUsd: values.saleType === 'auction' ? values.startingBidUsd : null,
        reservePriceUsd: values.saleType === 'auction' ? values.reservePriceUsd : null,
        priceUsd: values.priceUsd,
        salesFormat: values.salesFormat,
      });
      setPricingEditItem(null);
    });
  };

  const onSaveBreakSpots = (itemId: string, spots: LiveBreakVariantDraft[]) => {
    void run(async () => {
      const updates = spots
        .filter((s): s is LiveBreakVariantDraft & { id: string } => Boolean(s.id))
        .map((s) => ({
          id: s.id,
          priceUsd: s.priceUsd,
          isHot: s.isHot === true,
        }));
      if (updates.length === 0) {
        Alert.alert('Edit break', 'No spots to update.');
        return;
      }
      await patchLiveItemVariants(accessToken, roomId, itemId, updates);
      setPricingEditItem(null);
    });
  };

  const openPricingEditor = (item: LiveRoomItemRow) => {
    setPricingEditItem(item);
  };

  const pricingEditIsBreak = pricingEditItem != null && isVariantSalesFormat(pricingEditItem.salesFormat);

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
    giveaways,
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
    pricingEditIsBreak,
    openPricingEditor,
    onSaveQueuePricing,
    onSaveBreakSpots,
    onQuickAddLot,
    consoleError,
    chatMessages,
    loadOnce,
    refreshConsole,
    syncQueue: () => {
      void reload({ soft: true });
    },
    syncGiveaways: () => {
      void reload({ soft: true });
    },
    recordRandomSpotClaim,
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
