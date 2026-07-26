import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { LiveGiveawayRow } from '../api/liveGiveawayRepository';
import {
  fetchHostConsole,
  type HostConsolePayload,
  type HostPaymentFailureRow,
  type HostRecentSaleRow,
  type HostSellerShowSummary,
} from '../api/liveHostRepository';
import {
  createLiveRoomQueueItem,
  deleteLiveRoomQueueItem,
  importLiveRoomItemsFromRoom,
  manualAssignLiveItemVariant,
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
import { invalidateHostConsoleCache } from '../lib/hostConsoleCache';
import { buildExclusiveHostPinUpdates } from '../lib/liveItemVariant';
import { mergeLiveRoomItemsById, reconcileHostActiveItem } from '../lib/mergeLiveRoomItems';
import { mergeRandomSpotClaimIntoItem, type RandomSpotClaim } from '../lib/liveVariantSpotBoard';
import { useRealtimeRoomPresence } from './useRealtimeRoomPresence';
import { buildHostStartAuctionPatch, DEFAULT_AUCTION_SEC } from '../lib/liveAuctionStartPayload';
import { syncLiveRoomViewerCount } from '../lib/syncLiveRoomViewerCount';
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
  initialConsole,
  broadcastOnAir: broadcastOnAirProp,
}: {
  accessToken: string;
  roomId: string;
  roomStatus: 'scheduled' | 'live' | 'ended';
  roomType: 'auction' | 'sale' | 'break';
  sellerUsername?: string | null;
  navigation: NavigationProp<ParamListBase>;
  onBiddingUrgentChange?: (urgent: boolean) => void;
  onAfterAddLot?: () => void;
  /** When provided on first mount, skips duplicate host-console fetch. */
  initialConsole?: HostConsolePayload | null;
  /** When false, host cannot open timed bidding (stream not on air). Defaults to roomStatus === 'live'. */
  broadcastOnAir?: boolean;
}) {
  const [items, setItems] = useState<LiveRoomItemRow[]>([]);
  const [giveaways, setGiveaways] = useState<LiveGiveawayRow[]>([]);
  const [recentSales, setRecentSales] = useState<HostRecentSaleRow[]>([]);
  const [sellerSummary, setSellerSummary] = useState<HostSellerShowSummary | null>(null);
  const [paymentFailures, setPaymentFailures] = useState<HostPaymentFailureRow[]>([]);
  const [activeItem, setActiveItem] = useState<LiveRoomItemRow | null>(null);
  // Presence is for live viewer counts only — saved/scheduled shows must not open a presence session.
  const liveViewerCount = useRealtimeRoomPresence({
    liveRoomId: roomId,
    enabled: roomStatus === 'live',
    trackSelf: false,
  });
  // Sticky last known count — avoid flashing 0 while presence/broadcast reconnects.
  const stickyViewerCountRef = useRef<number | null>(null);
  if (liveViewerCount != null) stickyViewerCountRef.current = liveViewerCount;
  const viewerCount = liveViewerCount ?? stickyViewerCountRef.current ?? 0;
  useEffect(() => {
    if (liveViewerCount == null || roomStatus !== 'live') return;
    void syncLiveRoomViewerCount({ liveRoomId: roomId, viewerCount: liveViewerCount, accessToken });
  }, [accessToken, liveViewerCount, roomId, roomStatus]);
  const [serverNowMs, setServerNowMs] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [startingAuction, setStartingAuction] = useState(false);
  const [hostClutchTimeEnabled, setHostClutchTimeEnabled] = useState(false);
  const [hostAuctionDurationSec, setHostAuctionDurationSec] = useState(DEFAULT_AUCTION_SEC);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [pricingEditItem, setPricingEditItem] = useState<LiveRoomItemRow | null>(null);
  const [pinningVariantId, setPinningVariantId] = useState<string | null>(null);
  const [markSoldBusy, setMarkSoldBusy] = useState(false);
  const [consoleError, setConsoleError] = useState<SanitizedLiveError | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const hydratedRef = useRef(false);
  const sellerUsernameRef = useRef(sellerUsername);
  sellerUsernameRef.current = sellerUsername;

  const applyConsolePayload = useCallback(
    (data: Awaited<ReturnType<typeof fetchHostConsole>>) => {
      setItems((prev) => mergeLiveRoomItemsById(prev, data.items));
      setGiveaways(data.giveaways);
      if (data.syncScope !== 'lite') {
        setRecentSales(data.recentSales);
        setPaymentFailures(data.paymentFailures);
      }
      if (data.sellerSummary) setSellerSummary(data.sellerSummary);
      setActiveItem((prev) => reconcileHostActiveItem(prev, data.activeItem ?? null));
      logSellerQueue('queue_length', {
        total: data.items.length,
        queued: data.items.filter((i) => i.status === 'queued').length,
      });
      logSellerQueue('active_item', {
        id: data.activeItem?.id ?? null,
        status: data.activeItem?.status ?? null,
      });
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
    async (opts?: { soft?: boolean; force?: boolean }) => {
      try {
        const data = await fetchHostConsole(accessToken, roomId, {
          force: opts?.force ?? !opts?.soft,
          lite: Boolean(opts?.soft && !opts?.force),
        });
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

  const seededConsoleRoomRef = useRef<string | null>(null);

  useEffect(() => {
    setConsoleError(null);
    if (initialConsole?.room?.id === roomId) {
      if (seededConsoleRoomRef.current !== roomId) {
        seededConsoleRoomRef.current = roomId;
        hydratedRef.current = false;
        applyConsolePayload(initialConsole);
      }
      setLoading(false);
      return;
    }
    seededConsoleRoomRef.current = null;
    hydratedRef.current = false;
    setLoading(true);
    void loadOnce();
  }, [applyConsolePayload, initialConsole, loadOnce, roomId]);

  const biddingUrgent = useMemo(() => {
    if (!activeItem?.biddingOpen || !activeItem.auctionEndsAt) return false;
    const end = Date.parse(activeItem.auctionEndsAt);
    return Number.isFinite(end) && end - serverNowMs < 8000;
  }, [activeItem, serverNowMs]);

  useEffect(() => {
    onBiddingUrgentChange?.(biddingUrgent);
  }, [biddingUrgent, onBiddingUrgentChange]);

  useEffect(() => {
    if (roomStatus !== 'live') return;
    // Poll faster while an auction is about to end so host-console read_sweep can settle promptly.
    const ms = biddingUrgent ? 3_000 : 25_000;
    const id = setInterval(() => {
      void reload({ soft: true });
    }, ms);
    return () => clearInterval(id);
  }, [reload, roomStatus, biddingUrgent]);

  const autoCloseNudgedItemRef = useRef<string | null>(null);
  useEffect(() => {
    if (roomStatus !== 'live' || !activeItem?.id || !activeItem.biddingOpen || !activeItem.auctionEndsAt) {
      return;
    }
    const endsMs = Date.parse(activeItem.auctionEndsAt);
    if (!Number.isFinite(endsMs) || serverNowMs < endsMs + 1200) return;
    if (autoCloseNudgedItemRef.current === activeItem.id) return;
    autoCloseNudgedItemRef.current = activeItem.id;
    void import('../api/liveRoomBuyerRepository').then(({ finalizeOverdueLiveRoomAuctions }) =>
      finalizeOverdueLiveRoomAuctions(roomId, accessToken).finally(() => {
        void reload({ soft: true });
      }),
    );
  }, [
    accessToken,
    activeItem?.auctionEndsAt,
    activeItem?.biddingOpen,
    activeItem?.id,
    reload,
    roomId,
    roomStatus,
    serverNowMs,
  ]);

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

  const run = async (fn: () => Promise<void>) => {
    if (busy || roomStatus === 'ended') return;
    setBusy(true);
    setConsoleError(null);
    try {
      await fn();
      await reload({ force: true });
    } catch (e) {
      const sanitized = sanitizeLiveError(e, 'console');
      setConsoleError(sanitized);
      Alert.alert('Live room', sanitized.userMessage);
    } finally {
      setBusy(false);
    }
  };

  const onQuickAddLot = (payload: QuickLiveLotSubmitPayload, options?: QuickLiveLotSubmitOptions) => {
    if (busy) {
      Alert.alert('Add to show', 'Still saving the previous change. Try again in a moment.');
      return;
    }
    if (roomStatus === 'ended') {
      Alert.alert('Add to show', 'This show has ended. You cannot add queue items.');
      return;
    }
    setBusy(true);
    setConsoleError(null);
    void (async () => {
      try {
        const newItemId = await createLiveRoomQueueItem(accessToken, roomId, {
          title: payload.title,
          imageUrl: payload.imageUrl,
          salesFormat: payload.salesFormat,
          quantity: payload.quantity,
          startingBidUsd: payload.startingBidUsd,
          reservePriceUsd: payload.reservePriceUsd,
          priceUsd: payload.priceUsd,
          variants: payload.variants,
          variantAssignmentMode: payload.variantAssignmentMode,
          sellerShippingProfileId: payload.sellerShippingProfileId ?? null,
          shippingProfileId: payload.shippingProfileId ?? null,
        });
        setItems((prev) => {
          const sortOrder = prev.reduce((max, item) => Math.max(max, item.sortOrder ?? 0), -1) + 1;
          const optimistic: LiveRoomItemRow = {
            id: newItemId,
            title: payload.title,
            displayTitle: payload.title,
            status: 'queued',
            imageUrl: payload.imageUrl,
            quantity: payload.quantity,
            quantityInitial: payload.quantity,
            remainingQuantity: payload.quantity,
            startingBidUsd: payload.startingBidUsd,
            reservePriceUsd: payload.reservePriceUsd,
            priceUsd: payload.priceUsd,
            currentBidUsd: null,
            biddingOpen: false,
            auctionEndsAt: null,
            sortOrder,
            salesFormat: payload.salesFormat,
            variantAssignmentMode: payload.variantAssignmentMode,
            variants: payload.variants?.map((variant, index) => ({
              id: `pending-${newItemId}-${index}`,
              label: variant.label,
              priceUsd: variant.priceUsd,
              quantityRemaining: variant.quantityInitial ?? 1,
              isHot: variant.isHot ?? false,
              status: 'available',
              buyerUsername: null,
              color: variant.color ?? null,
              sortOrder: variant.sortOrder ?? index,
            })),
          };
          return mergeLiveRoomItemsById(prev, [optimistic]);
        });
        logSellerQueue('add_item_success', {
          itemId: newItemId,
          title: payload.title.slice(0, 80),
          quantity: payload.quantity,
          salesFormat: payload.salesFormat,
          variantCount: payload.variants?.length ?? 0,
          startingBidUsd: payload.startingBidUsd,
          reservePriceUsd: payload.reservePriceUsd,
          priceUsd: payload.priceUsd,
        });
        invalidateHostConsoleCache(roomId);
        await reload({ force: true });
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

  const onSubmitFromShop = (listingIds: string[]) => {
    if (busy) {
      Alert.alert('Add to show', 'Still saving the previous change. Try again in a moment.');
      return;
    }
    if (roomStatus === 'ended') {
      Alert.alert('Add to show', 'This show has ended. You cannot add queue items.');
      return;
    }
    setBusy(true);
    setConsoleError(null);
    void (async () => {
      try {
        let added = 0;
        const errors: string[] = [];
        for (const listingId of listingIds) {
          try {
            await createLiveRoomQueueItem(accessToken, roomId, {
              title: '',
              listingId,
            });
            added += 1;
          } catch (e) {
            errors.push(e instanceof Error ? e.message : 'Could not add item.');
          }
        }
        invalidateHostConsoleCache(roomId);
        await reload({ force: true });
        if (added === 0) {
          Alert.alert('From my shop', errors[0] ?? 'Could not add shop items.');
          return;
        }
        setInventoryOpen(false);
        onAfterAddLot?.();
        if (errors.length) {
          Alert.alert('From my shop', `Added ${added}. ${errors.length} skipped.`);
        }
      } catch (e) {
        const sanitized = sanitizeLiveError(e, 'console');
        setConsoleError(sanitized);
        Alert.alert('From my shop', sanitized.userMessage);
      } finally {
        setBusy(false);
      }
    })();
  };

  const onImportFromPriorRoom = (sourceRoomId: string) => {
    if (busy) {
      Alert.alert('Copy last show', 'Still saving the previous change. Try again in a moment.');
      return;
    }
    if (roomStatus === 'ended') {
      Alert.alert('Copy last show', 'This show has ended. You cannot add queue items.');
      return;
    }
    setBusy(true);
    setConsoleError(null);
    void (async () => {
      try {
        const result = await importLiveRoomItemsFromRoom(accessToken, roomId, sourceRoomId);
        invalidateHostConsoleCache(roomId);
        await reload({ force: true });
        setInventoryOpen(false);
        onAfterAddLot?.();
        const label = result.sourceTitle?.trim() || 'prior show';
        Alert.alert(
          'Copy last show',
          result.skipped > 0
            ? `Copied ${result.imported} from ${label} (${result.skipped} already in lineup).`
            : `Copied ${result.imported} from ${label}.`,
        );
      } catch (e) {
        const sanitized = sanitizeLiveError(e, 'console');
        setConsoleError(sanitized);
        Alert.alert('Copy last show', sanitized.userMessage);
      } finally {
        setBusy(false);
      }
    })();
  };

  const onSaveQueuePricing = (itemId: string, values: QuickLiveLotValues) => {
    void run(async () => {
      const existing =
        pricingEditItem?.id === itemId
          ? pricingEditItem
          : items.find((row) => row.id === itemId) ?? null;
      const prevFormat = existing?.salesFormat ?? 'auction';
      const nextFormat = values.salesFormat;

      if (
        prevFormat !== nextFormat &&
        (nextFormat === 'auction' || nextFormat === 'buy_now') &&
        !isVariantSalesFormat(prevFormat)
      ) {
        await patchLiveRoomItem(accessToken, roomId, itemId, {
          action: 'setCommerceFormat',
          salesFormat: nextFormat,
        });
      }

      await patchLiveRoomItem(accessToken, roomId, itemId, {
        quantity: values.quantity,
        startingBidUsd: values.saleType === 'auction' ? values.startingBidUsd : null,
        reservePriceUsd: values.saleType === 'auction' ? values.reservePriceUsd : null,
        priceUsd: values.priceUsd,
      });
      setPricingEditItem(null);
    });
  };

  const onSaveBreakSpots = (itemId: string, spots: LiveBreakVariantDraft[]) => {
    void run(async () => {
      const updates = spots
        .filter((s): s is LiveBreakVariantDraft & { id: string } => Boolean(s.id) && !s.soldOut)
        .map((s) => ({
          id: s.id,
          priceUsd: s.priceUsd,
          isHot: s.isHot === true,
        }));
      if (updates.length === 0) {
        Alert.alert('Edit break', 'No open spots to update.');
        return;
      }
      await patchLiveItemVariants(accessToken, roomId, itemId, updates);
      setPricingEditItem(null);
    });
  };

  const onPinLiveTeam = (itemId: string, variantId: string, variants: Array<{ id: string }>) => {
    void run(async () => {
      setPinningVariantId(variantId);
      try {
        const updates = buildExclusiveHostPinUpdates(variants, variantId);
        await patchLiveItemVariants(accessToken, roomId, itemId, updates);
        invalidateHostConsoleCache(roomId);
        await reload({ force: true });
      } finally {
        setPinningVariantId(null);
      }
    });
  };

  const onMarkSoldLiveTeam = (args: { itemId: string; variantId: string; username: string; label: string }) => {
    void run(async () => {
      setMarkSoldBusy(true);
      try {
        const result = await manualAssignLiveItemVariant({
          accessToken,
          roomId,
          itemId: args.itemId,
          variantId: args.variantId,
          username: args.username,
        });
        const buyerUsername = result.buyerUsername.replace(/^@+/, '');
        const markVariantSold = (item: LiveRoomItemRow): LiveRoomItemRow => {
          if (item.id !== args.itemId || !item.variants?.length) return item;
          return {
            ...item,
            itemVersion: (item.itemVersion ?? 0) + 1,
            variants: item.variants.map((v) =>
              v.id === args.variantId
                ? {
                    ...v,
                    quantityRemaining: 0,
                    status: 'sold_out',
                    isHot: false,
                    buyerUsername,
                    soldCount: (v.soldCount ?? 0) + 1,
                  }
                : v,
            ),
          };
        };
        setItems((prev) => prev.map(markVariantSold));
        setActiveItem((prev) => (prev ? markVariantSold(prev) : prev));
        invalidateHostConsoleCache(roomId);
        await reload({ force: true });
        Alert.alert('Marked sold', `${result.label} → @${result.buyerUsername}`);
      } finally {
        setMarkSoldBusy(false);
      }
    });
  };

  const openPricingEditor = (item: LiveRoomItemRow) => {
    const fresh =
      (activeItem?.id === item.id ? activeItem : null) ??
      items.find((row) => row.id === item.id) ??
      item;
    setPricingEditItem(fresh);
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
    if (roomStatus !== 'live' || !broadcastOnAir) {
      Alert.alert(
        'Go live first',
        'Start your broadcast before opening bidding. Buyers need to see you live first.',
      );
      return;
    }
    void run(async () => {
      setStartingAuction(true);
      try {
        await patchLiveRoomItem(
          accessToken,
          roomId,
          activeItem.id,
          buildHostStartAuctionPatch({
            auctionDurationSec: hostAuctionDurationSec,
            clutchTimeEnabled: hostClutchTimeEnabled,
          }),
        );
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
    if (roomStatus !== 'live' || !broadcastOnAir) {
      Alert.alert(
        'Go live first',
        'Start your broadcast before opening bidding. Buyers need to see you live first.',
      );
      return;
    }
    void run(async () => {
      await patchLiveRoomItem(accessToken, roomId, item.id, { status: 'active' });
      setStartingAuction(true);
      try {
        await patchLiveRoomItem(
          accessToken,
          roomId,
          item.id,
          buildHostStartAuctionPatch({
            auctionDurationSec: hostAuctionDurationSec,
            clutchTimeEnabled: hostClutchTimeEnabled,
          }),
        );
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
  const broadcastOnAir = broadcastOnAirProp ?? roomLive;
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
    hostClutchTimeEnabled,
    toggleHostClutchTime: () => setHostClutchTimeEnabled((v) => !v),
    hostAuctionDurationSec,
    setHostAuctionDurationSec,
    inventoryOpen,
    setInventoryOpen,
    pricingEditItem,
    setPricingEditItem,
    pricingEditIsBreak,
    openPricingEditor,
    onSaveQueuePricing,
    onSaveBreakSpots,
    onPinLiveTeam,
    pinningVariantId,
    onMarkSoldLiveTeam,
    markSoldBusy,
    onQuickAddLot,
    onSubmitFromShop,
    onImportFromPriorRoom,
    consoleError,
    chatMessages,
    loadOnce,
    refreshConsole,
    syncQueue: () => {
      void reload({ soft: true, force: true });
    },
    syncGiveaways: () => {
      void reload({ soft: true, force: true });
    },
    syncSales: () => reload({ soft: true, force: true }),
    recentSales,
    sellerSummary,
    paymentFailures,
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
    broadcastOnAir,
    roomEnded,
    queuedCount,
    biddingUrgent,
  };
}
