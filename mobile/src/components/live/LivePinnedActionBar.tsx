import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { LiveRoomText } from './LiveRoomText';
import { fetchBuyerWalletSummary } from '../../api/buyerWalletRepository';
import {
  createLiveBidIdempotencyKey,
  fetchLiveRoomBuyerSnapshot,
  finalizeOverdueLiveRoomAuctions,
  placeLiveRoomBid,
  type LiveRoomBuyerSnapshot,
} from '../../api/liveRoomBuyerRepository';
import {
  isWalletIncompleteError,
  isWalletIncompleteReadiness,
  walletReadinessFromSnapshot,
  type BuyerWalletReadiness,
} from '../../lib/buyerWalletErrors';
import {
  LIVE_AUCTION_BUYER_NOT_STARTED_COPY,
  LIVE_AUCTION_BUYER_TIMER_ENDED_COPY,
} from '../../lib/liveAuctionLotPhase';
import { logLiveBidButtonPress, mustUseLiveBidFlow } from '../../lib/liveCommerceRouting';
import { logBidControl } from '../../lib/bidControlLog';
import { openWebCommerceUrl, webLiveRoomUrl } from '../../lib/openWebCommerce';
import { logLiveBidBlocked, logWalletSheet } from '../wallet/walletSheetKeyboard';
import { WalletSheet } from '../wallet/WalletSheet';
import type { LiveStackParamList, MainTabParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';
import type { LiveStream } from '../../types';
import { HoldToBidButton } from './HoldToBidButton';
import { resolveBuyerRoomKind, resolveLiveBuyerCommerceHud } from './liveActionModule';
import { LiveBreakSpotGridSheet } from './LiveBreakSpotGridSheet';
import { isActiveVariantBuyerItem } from '../../lib/liveItemVariant';
import { reconcileBuyerSnapshotMonotonic } from '../../lib/liveRoomBuyerSnapshotMerge';
import { computeAuctionRemainingMs, logAuctionTimer } from '../../lib/auctionTimerSync';
import { syncedWallTimeMs } from '../../lib/serverClockSync';
import {
  isCompactLiveRoomLayout,
  LIVE_ROOM_REF_WIDTH,
  liveRoomCompactScale,
} from '../../lib/liveRoomUiScale';

/** @deprecated Prefer measuring commerce HUD via `onLayout`; used as initial layout estimate only. */
export const LIVE_COMMERCE_OVERLAY_HEIGHT = 118;

const BID_THROTTLE_MS = 850;
/** Hard safety net: clear pending bid state even if the network/realtime never confirms. */
const BID_PENDING_SAFETY_MS = 1800;

type Props = {
  stream: LiveStream;
  bottomSafeInset?: number;
  /** When false, commerce CTAs call `onRequireAuth` instead of acting. */
  signedIn?: boolean;
  onRequireAuth?: () => void;
  /** Opens the in-room shop sheet (same as the rail “Shop” control). */
  onOpenInlineShop?: () => void;
  accessToken?: string;
  /** Realtime-managed buyer snapshot (from `useLiveRoomRealtimeSession`). */
  roomSnap?: LiveRoomBuyerSnapshot | null;
  syncRefreshing?: boolean;
  onRefreshSnapshot?: () => Promise<LiveRoomBuyerSnapshot | null>;
  /** Server clock skew for auction timer sync. */
  clockSkewMs?: number;
  /** Merge bid HTTP ACK into live snapshot (timer + high bid). */
  mergeBidAck?: (ack: import('../../api/liveRoomBuyerRepository').LiveBidHttpAck) => void;
  onBidPlaced?: (amountUsd: number) => void;
  /** Break rooms: block bid CTAs until disclaimer accepted. */
  participationBlocked?: boolean;
  /** Host or assigned moderator — cannot bid/buy in this show. */
  staffCommerceBlocked?: boolean;
  /** Parent can disable feed gestures while wallet overlay is open. */
  onWalletOverlayChange?: (active: boolean) => void;
  /** Stage design width — drives compact HUD sizing on iPhone 15-class screens. */
  layoutWidth?: number;
  /** Exposes in-room wallet opener for rail / external entry points. */
  onRegisterOpenWallet?: (open: (reason?: string) => void) => void;
};

export function LivePinnedActionBar({
  stream,
  bottomSafeInset = 0,
  signedIn = true,
  onRequireAuth,
  onOpenInlineShop,
  accessToken,
  roomSnap: roomSnapProp,
  syncRefreshing: syncRefreshingProp,
  onRefreshSnapshot,
  clockSkewMs = 0,
  mergeBidAck,
  onBidPlaced,
  participationBlocked = false,
  staffCommerceBlocked = false,
  onWalletOverlayChange,
  layoutWidth,
  onRegisterOpenWallet,
}: Props) {
  const stackNav = useNavigation<NativeStackNavigationProp<LiveStackParamList>>();
  const tabNav = stackNav.getParent<BottomTabNavigationProp<MainTabParamList>>();
  const stageWidth = layoutWidth ?? LIVE_ROOM_REF_WIDTH;
  const hudScale = liveRoomCompactScale(stageWidth);
  const compact = isCompactLiveRoomLayout(stageWidth);
  const [bidBusy, setBidBusy] = useState(false);
  const [walletSheetOpen, setWalletSheetOpen] = useState(false);
  const [walletOverlayActive, setWalletOverlayActive] = useState(false);
  const walletOverlayOpenRef = useRef(false);
  const bidInFlightRef = useRef(false);
  const lastBidAttemptMsRef = useRef(0);
  const bidSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [walletReadiness, setWalletReadiness] = useState<BuyerWalletReadiness | null>(null);
  const [variantSheetOpen, setVariantSheetOpen] = useState(false);
  const [variantStripePublishableKey, setVariantStripePublishableKey] = useState<string | null>(null);
  const [timerTick, setTimerTick] = useState(0);
  const [localRoomSnap, setLocalRoomSnap] = useState<LiveRoomBuyerSnapshot | null>(null);
  const [localSyncRefreshing, setLocalSyncRefreshing] = useState(false);
  const usingExternalSync = onRefreshSnapshot != null;
  const roomSnap = usingExternalSync ? (roomSnapProp ?? null) : localRoomSnap;
  const syncRefreshing = usingExternalSync ? (syncRefreshingProp ?? false) : localSyncRefreshing;
  const buyerKind = useMemo(() => resolveBuyerRoomKind(roomSnap, stream), [roomSnap, stream]);
  const syncedNowMs = useMemo(() => syncedWallTimeMs(clockSkewMs), [clockSkewMs, timerTick]);
  const m = useMemo(
    () => resolveLiveBuyerCommerceHud(stream, roomSnap, syncedNowMs),
    [stream, roomSnap, syncedNowMs],
  );

  useEffect(() => {
    if (roomSnap?.lotBidPhase !== 'bidding_open' || !roomSnap.auctionEndsAt) return undefined;
    const id = setInterval(() => setTimerTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [roomSnap?.lotBidPhase, roomSnap?.auctionEndsAt]);

  const autoCloseNudgedItemRef = useRef<string | null>(null);

  useEffect(() => {
    if (roomSnap?.lotBidPhase !== 'bidding_open' || !roomSnap.auctionEndsAt) return;
    if (timerTick % 4 !== 0) return;
    logAuctionTimer({
      source: 'buyer_hud_tick',
      serverNowMs: roomSnap.serverNowMs,
      localNowMs: Date.now(),
      offsetMs: clockSkewMs,
      auctionEndsAt: roomSnap.auctionEndsAt,
      remainingMs: computeAuctionRemainingMs(roomSnap.auctionEndsAt, clockSkewMs),
      lotBidPhase: roomSnap.lotBidPhase,
    });
  }, [clockSkewMs, roomSnap?.auctionEndsAt, roomSnap?.lotBidPhase, roomSnap?.serverNowMs, timerTick]);
  const auctionLane = buyerKind === 'auction';
  const commerceBlocked =
    walletOverlayActive || walletSheetOpen || variantSheetOpen || Boolean(roomSnap?.unresolvedPaymentFailure);
  const primaryDisabled = m.buyerPrimaryDisabled === true || participationBlocked || commerceBlocked || staffCommerceBlocked;
  const secondaryDisabled = m.buyerSecondaryDisabled === true || participationBlocked || commerceBlocked || staffCommerceBlocked;
  const padBottom = 4 + Math.min(10, Math.round(bottomSafeInset * (compact ? 0.25 : 0.35)));
  const metaLine = [m.winningLine, m.stateLine].filter(Boolean).join(' · ');

  const guard = (fn: () => void) => {
    if (!signedIn) {
      onRequireAuth?.();
      return;
    }
    fn();
  };

  const openWalletSetup = useCallback((reason: string, seed?: BuyerWalletReadiness | null) => {
    if (walletOverlayOpenRef.current || walletSheetOpen) {
      logWalletSheet('ignored duplicate open', { reason });
      return false;
    }
    logWalletSheet('open reason', { reason });
    walletOverlayOpenRef.current = true;
    setWalletOverlayActive(true);
    onWalletOverlayChange?.(true);
    if (seed) setWalletReadiness(seed);
    else {
      const fromSnap = walletReadinessFromSnapshot(roomSnap);
      if (fromSnap) setWalletReadiness(fromSnap);
    }
    setWalletSheetOpen(true);
    return true;
  }, [onWalletOverlayChange, roomSnap, walletSheetOpen]);

  const clearBidSafetyTimer = useCallback(() => {
    if (bidSafetyTimerRef.current) {
      clearTimeout(bidSafetyTimerRef.current);
      bidSafetyTimerRef.current = null;
    }
  }, []);

  const resetBidControl = useCallback((reason: string) => {
    clearBidSafetyTimer();
    logBidControl('reset', { reason, roomId: stream.id });
    bidInFlightRef.current = false;
    setBidBusy(false);
    console.info('[bid] pending cleared', { reason, roomId: stream.id });
  }, [clearBidSafetyTimer, stream.id]);

  const closeWalletSetup = useCallback(() => {
    logWalletSheet('close');
    walletOverlayOpenRef.current = false;
    setWalletSheetOpen(false);
    setWalletOverlayActive(false);
    onWalletOverlayChange?.(false);
    resetBidControl('wallet_closed');
  }, [onWalletOverlayChange, resetBidControl]);

  const openWalletFromOutside = useCallback(
    (reason = 'wallet_rail') => {
      if (!signedIn) {
        onRequireAuth?.();
        return;
      }
      openWalletSetup(reason);
    },
    [onRequireAuth, openWalletSetup, signedIn],
  );

  useEffect(() => {
    onRegisterOpenWallet?.(openWalletFromOutside);
  }, [onRegisterOpenWallet, openWalletFromOutside]);

  useEffect(() => () => clearBidSafetyTimer(), [clearBidSafetyTimer]);

  const lastSnapSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (!roomSnap) return;
    const sig = `${roomSnap.currentBidUsd ?? ''}|${roomSnap.minNextBidUsd ?? ''}|${roomSnap.auctionEndsAt ?? ''}|${roomSnap.lotBidPhase}`;
    if (lastSnapSigRef.current === sig) return;
    lastSnapSigRef.current = sig;
    console.info('[bid] realtime update received', {
      currentBidUsd: roomSnap.currentBidUsd,
      minNextBidUsd: roomSnap.minNextBidUsd,
      lotBidPhase: roomSnap.lotBidPhase,
      fetchedAtMs: roomSnap.fetchedAtMs,
    });
  }, [roomSnap, roomSnap?.currentBidUsd, roomSnap?.minNextBidUsd, roomSnap?.auctionEndsAt, roomSnap?.lotBidPhase]);

  const useLiveAuctionBidFlow = mustUseLiveBidFlow(stream, roomSnap, {
    bottomRightIsSlide: m.bottomRightIsSlide,
    bottomRightLabel: m.bottomRightLabel,
  });
  const variantItemActive = isActiveVariantBuyerItem(roomSnap);
  const walletReady = useMemo(() => {
    const fromSnap = walletReadinessFromSnapshot(roomSnap);
    const r = walletReadiness ?? fromSnap;
    return Boolean(r?.paymentReady && r?.shippingReady);
  }, [roomSnap, walletReadiness]);

  useEffect(() => {
    if (!variantSheetOpen || !accessToken?.trim()) {
      setVariantStripePublishableKey(null);
      return;
    }
    let cancelled = false;
    void fetchBuyerWalletSummary(accessToken)
      .then((summary) => {
        if (!cancelled) setVariantStripePublishableKey(summary?.stripePublishableKey ?? null);
      })
      .catch(() => {
        if (!cancelled) setVariantStripePublishableKey(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, variantSheetOpen]);

  const refreshRoomSnapshot = useCallback(async (): Promise<LiveRoomBuyerSnapshot | null> => {
    if (onRefreshSnapshot) return onRefreshSnapshot();
    setLocalSyncRefreshing(true);
    try {
      const snap = await fetchLiveRoomBuyerSnapshot(accessToken, stream.id);
      setLocalRoomSnap((prev) => {
        const { snap: reconciled, staleIgnored } = reconcileBuyerSnapshotMonotonic(prev, snap);
        if (staleIgnored) {
          console.info('[bid] stale snapshot ignored', {
            keptHighBidUsd: prev?.currentBidUsd ?? null,
            incomingHighBidUsd: snap.currentBidUsd,
            activeItemId: snap.activeItemId,
          });
        }
        return reconciled;
      });
      return snap;
    } catch {
      return null;
    } finally {
      setLocalSyncRefreshing(false);
    }
  }, [accessToken, onRefreshSnapshot, stream.id]);

  useEffect(() => {
    if (usingExternalSync) return undefined;
    void refreshRoomSnapshot();
    const pollMs = buyerKind === 'auction' ? 4000 : 12000;
    const id = setInterval(() => {
      void refreshRoomSnapshot();
    }, pollMs);
    return () => clearInterval(id);
  }, [buyerKind, refreshRoomSnapshot, usingExternalSync]);

  // Buyer-side server-authoritative auto-close nudge: the instant our synced clock passes the lot
  // timer, ask the server to finalize and pull a fast snapshot so the Winner/result popup lands in
  // ~1-2s instead of waiting for the slow poll. The server re-checks endsAt (it can't close early),
  // and realtime `purchase_completed` remains the primary path; this is the immediacy fallback.
  useEffect(() => {
    const itemId = roomSnap?.activeItemId;
    const endsAtIso = roomSnap?.auctionEndsAt;
    if (!itemId || !endsAtIso || roomSnap?.lotBidPhase !== 'bidding_open') return;
    const endsMs = Date.parse(endsAtIso);
    if (!Number.isFinite(endsMs) || syncedNowMs < endsMs + 1200) return;
    if (autoCloseNudgedItemRef.current === itemId) return;
    autoCloseNudgedItemRef.current = itemId;
    console.info('[auction close ui] buyer timer ended, fast refresh', { roomId: stream.id, itemId });
    void finalizeOverdueLiveRoomAuctions(stream.id, accessToken);
    setTimeout(() => {
      void refreshRoomSnapshot();
    }, 400);
  }, [
    syncedNowMs,
    roomSnap?.activeItemId,
    roomSnap?.auctionEndsAt,
    roomSnap?.lotBidPhase,
    stream.id,
    accessToken,
    refreshRoomSnapshot,
  ]);

  const syncStatusLine = useMemo(() => {
    if (!auctionLane) return null;
    if (syncRefreshing) return 'Refreshing room…';
    if (roomSnap?.fetchedAtMs) {
      const t = new Date(roomSnap.fetchedAtMs);
      return `Last updated ${t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    return null;
  }, [auctionLane, roomSnap?.fetchedAtMs, syncRefreshing]);

  const openFullLiveRoom = useCallback(() => {
    const url = webLiveRoomUrl(stream.id);
    if (!url) {
      Alert.alert('Configuration', 'Set EXPO_PUBLIC_SITE_URL to open the live room in your browser.');
      return;
    }
    void openWebCommerceUrl(url);
  }, [stream.id]);

  const tryPlaceLiveBid = useCallback(async () => {
    const now = Date.now();
    if (now - lastBidAttemptMsRef.current < BID_THROTTLE_MS) {
      logBidControl('blocked', { reason: 'bid throttle', msSinceLast: now - lastBidAttemptMsRef.current });
      logLiveBidBlocked('bid throttle', { msSinceLast: now - lastBidAttemptMsRef.current });
      return;
    }
    if (walletOverlayOpenRef.current || walletSheetOpen) {
      logBidControl('blocked', { reason: 'wallet overlay open' });
      logLiveBidBlocked('wallet overlay open');
      return;
    }
    if (!accessToken) {
      logBidControl('blocked', { reason: 'auth required' });
      onRequireAuth?.();
      return;
    }
    if (participationBlocked) {
      logBidControl('blocked', { reason: 'participation blocked' });
      Alert.alert('Accept notice', 'Accept the live break notice before bidding.');
      return;
    }
    if (bidInFlightRef.current || bidBusy) {
      logBidControl('blocked', { reason: 'bid in flight' });
      return;
    }

    lastBidAttemptMsRef.current = now;
    bidInFlightRef.current = true;
    setBidBusy(true);
    console.info('[bid] submit start', { roomId: stream.id });
    clearBidSafetyTimer();
    bidSafetyTimerRef.current = setTimeout(() => {
      bidSafetyTimerRef.current = null;
      if (!bidInFlightRef.current) return;
      logBidControl('reset', { reason: 'safety_timeout', roomId: stream.id });
      bidInFlightRef.current = false;
      setBidBusy(false);
      console.info('[bid] pending cleared', { reason: 'safety_timeout', roomId: stream.id });
    }, BID_PENDING_SAFETY_MS);
    let openedWallet = false;
    try {
      const snap = roomSnap ?? (await refreshRoomSnapshot());
      if (!snap) {
        logBidControl('blocked', { reason: 'snapshot unavailable' });
        Alert.alert('Could not load room', 'Try again or open the live room in your browser.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open live room', onPress: openFullLiveRoom },
        ]);
        return;
      }
      const walletFromSnap = walletReadinessFromSnapshot(snap);
      if (walletFromSnap && isWalletIncompleteReadiness(walletFromSnap)) {
        logBidControl('blocked', { reason: 'wallet incomplete' });
        openedWallet = openWalletSetup('precheck_incomplete', walletFromSnap);
        return;
      }
      if (snap.status !== 'live' || !snap.activeItemId) {
        logBidControl('blocked', { reason: 'bidding not open', lotBidPhase: snap.lotBidPhase });
        Alert.alert(
          'Bidding not open',
          'This lot is not accepting bids right now. Open the full live room for the latest state.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open live room', onPress: openFullLiveRoom },
          ],
        );
        return;
      }
      if (snap.lotBidPhase === 'timer_ended_unsettled') {
        logBidControl('blocked', { reason: 'timer ended unsettled' });
        Alert.alert('Bidding closed', LIVE_AUCTION_BUYER_TIMER_ENDED_COPY, [
          { text: 'OK', style: 'cancel' },
          { text: 'Open live room', onPress: openFullLiveRoom },
        ]);
        return;
      }
      if (snap.lotBidPhase !== 'bidding_open') {
        logBidControl('blocked', { reason: 'lot not open', lotBidPhase: snap.lotBidPhase });
        Alert.alert('Bidding not open yet', LIVE_AUCTION_BUYER_NOT_STARTED_COPY, [
          { text: 'OK', style: 'cancel' },
          { text: 'Open live room', onPress: openFullLiveRoom },
        ]);
        return;
      }
      const amount = snap.minNextBidUsd;
      if (amount == null || !Number.isFinite(amount) || amount <= 0) {
        logBidControl('blocked', { reason: 'invalid min bid', amount });
        Alert.alert('Could not bid', 'Minimum bid is unavailable. Try the full live room.');
        return;
      }
      logBidControl('commit', {
        roomId: stream.id,
        itemId: snap.activeItemId,
        amountUsd: amount,
      });
      const ack = await placeLiveRoomBid({
        accessToken,
        roomId: stream.id,
        itemId: snap.activeItemId,
        amountUsd: amount,
        idempotencyKey: createLiveBidIdempotencyKey(),
      });
      mergeBidAck?.(ack);
      console.info('[bid] submit success', { roomId: stream.id, itemId: snap.activeItemId, amountUsd: amount });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onBidPlaced?.(amount);
      // The HTTP ACK already merged the new high bid + next min bid into the snapshot, so the
      // button can re-enable immediately. Refresh in the background for eventual consistency —
      // never block the pending state on the slow snapshot poll.
      void refreshRoomSnapshot()
        .then((snapAfter) => console.info('[bid] fallback refresh complete', { ok: snapAfter != null }))
        .catch(() => {});
    } catch (e) {
      console.info('[bid] submit error', {
        roomId: stream.id,
        message: e instanceof Error ? e.message : 'unknown',
        code: e instanceof Error ? (e as Error & { code?: string }).code : undefined,
      });
      if (isWalletIncompleteError(e)) {
        logBidControl('blocked', { reason: 'wallet incomplete api 402' });
        if (!walletOverlayOpenRef.current && !walletSheetOpen) {
          openedWallet = openWalletSetup('api_402', {
            paymentReady: e.paymentReady,
            shippingReady: e.shippingReady,
          });
        } else {
          logWalletSheet('ignored duplicate open', { reason: 'api_402' });
        }
        return;
      }
      if (e instanceof Error && (e as Error & { code?: string }).code === 'LIVE_PAYMENT_BLOCKED') {
        logBidControl('blocked', { reason: 'payment failure lockout' });
        await refreshRoomSnapshot();
        return;
      }
      logBidControl('blocked', { reason: 'bid failed', message: e instanceof Error ? e.message : 'unknown' });
      Alert.alert('Could not place bid', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      clearBidSafetyTimer();
      if (!openedWallet && !walletOverlayOpenRef.current) {
        resetBidControl('bid_complete');
      } else if (openedWallet) {
        bidInFlightRef.current = false;
        setBidBusy(false);
        logBidControl('reset', { reason: 'wallet_opened', roomId: stream.id });
        console.info('[bid] pending cleared', { reason: 'wallet_opened', roomId: stream.id });
      }
    }
  }, [
    accessToken,
    bidBusy,
    onRequireAuth,
    onBidPlaced,
    openFullLiveRoom,
    openWalletSetup,
    refreshRoomSnapshot,
    participationBlocked,
    roomSnap,
    stream.id,
    walletSheetOpen,
    resetBidControl,
    clearBidSafetyTimer,
    mergeBidAck,
  ]);

  const runPrimaryLiveCommerceAction = useCallback(() => {
    if (staffCommerceBlocked) {
      Alert.alert(
        'Not available',
        'Hosts and moderators cannot bid or buy items in this show.',
      );
      return;
    }
    if (walletOverlayOpenRef.current || walletSheetOpen || bidInFlightRef.current) {
      logBidControl('blocked', { reason: 'wallet overlay open' });
      logLiveBidBlocked('wallet overlay open');
      return;
    }
    logLiveBidButtonPress({
      roomId: stream.id,
      activeItemId: roomSnap?.activeItemId ?? null,
      auctionLane,
      useLiveAuctionBidFlow,
      selectedAction: useLiveAuctionBidFlow ? 'live_bid' : 'blocked_not_live_bid_ui',
      bottomRightLabel: m.bottomRightLabel,
      bottomRightIsSlide: m.bottomRightIsSlide,
      roomType: roomSnap?.roomType ?? null,
      lotBidPhase: roomSnap?.lotBidPhase ?? null,
    });

    if (variantItemActive) {
      setVariantSheetOpen(true);
      return;
    }

    if (useLiveAuctionBidFlow) {
      void tryPlaceLiveBid();
      return;
    }

    // Live room hard guard: never route pinned commerce to Initiate Trade.
    Alert.alert(
      'Not available yet',
      'This action is not open for the current lot. Wait for the host or refresh the room.',
    );
  }, [
    auctionLane,
    m.bottomRightIsSlide,
    m.bottomRightLabel,
    roomSnap?.activeItemId,
    roomSnap?.lotBidPhase,
    roomSnap?.roomType,
    stream.id,
    staffCommerceBlocked,
    tryPlaceLiveBid,
    variantItemActive,
    useLiveAuctionBidFlow,
    walletSheetOpen,
    staffCommerceBlocked,
  ]);

  const onSecondary = () => {
    if (secondaryDisabled) return;
    guard(() => {
      // Stay in room — live commerce secondary never routes to Trade.
    });
  };
  const onHoldStart = () => {
    if (!signedIn) {
      onRequireAuth?.();
      return false;
    }
    if (primaryDisabled || bidBusy) {
      logBidControl('blocked', {
        reason: primaryDisabled ? 'primary disabled' : 'bid busy',
        lotBidPhase: roomSnap?.lotBidPhase ?? null,
      });
      return false;
    }
    return true;
  };

  const onPrimary = () => {
    if (primaryDisabled || bidBusy) {
      logBidControl('blocked', {
        reason: primaryDisabled ? 'primary disabled' : 'bid busy',
        lotBidPhase: roomSnap?.lotBidPhase ?? null,
      });
      return;
    }
    guard(() => runPrimaryLiveCommerceAction());
  };
  const onShop = () =>
    guard(() => {
      if (onOpenInlineShop) onOpenInlineShop();
      else tabNav?.navigate('Marketplace');
    });

  return (
    <View
      style={[styles.floatRoot, { paddingBottom: padBottom }]}
      pointerEvents={commerceBlocked ? 'box-none' : 'auto'}
    >
      {Platform.OS === 'ios' ? (
        <BlurView intensity={42} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.androidTint]} />
      )}
      <LinearGradient
        colors={['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.45)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.hudBorder} />

      <View style={[styles.hudInner, compact && styles.hudInnerCompact]}>
        <View style={styles.topBand}>
          <LiveRoomText style={[styles.timer, compact && { fontSize: Math.round(13 * hudScale) }]}>
            {m.timerMmSs}
          </LiveRoomText>
          <View style={styles.titleBlock}>
            <LiveRoomText style={[styles.itemTitle, compact && { fontSize: 11 }]} numberOfLines={1}>
              {m.itemTitle}
            </LiveRoomText>
            <LiveRoomText style={styles.categoryType} numberOfLines={1}>
              {m.categoryType}
            </LiveRoomText>
          </View>
          <View style={styles.priceBlock}>
            <LiveRoomText style={styles.currentPrefix}>{m.currentPrefix}</LiveRoomText>
            <LiveRoomText style={[styles.currentAmount, compact && { fontSize: Math.round(20 * hudScale) }]}>
              {m.currentAmount}
            </LiveRoomText>
          </View>
        </View>

        {metaLine ? (
          <LiveRoomText style={styles.metaLine} numberOfLines={1}>
            {metaLine}
          </LiveRoomText>
        ) : null}
        {auctionLane && signedIn ? (
          <LiveRoomText style={styles.syncLine} numberOfLines={compact ? 1 : 2}>
            {syncStatusLine ?? 'Syncing auction state from the vault…'}
          </LiveRoomText>
        ) : null}

        <View style={[styles.ctaBand, compact && styles.ctaBandCompact]}>
          <Pressable
            style={[styles.ctaGhost, compact && styles.ctaGhostCompact, secondaryDisabled && styles.ctaDisabled]}
            onPress={onSecondary}
            disabled={secondaryDisabled}
          >
            <LiveRoomText
              style={[styles.ctaGhostText, secondaryDisabled && styles.ctaDisabledText]}
              numberOfLines={1}
            >
              {m.bottomLeftLabel}
            </LiveRoomText>
          </Pressable>

          {m.showShopButton ? (
            <Pressable style={styles.ctaShop} onPress={onShop} accessibilityLabel={m.shopButtonLabel}>
              <Ionicons name="bag-handle-outline" size={20} color="rgba(255,255,255,0.88)" />
            </Pressable>
          ) : null}

          <View style={styles.ctaPrimaryWrap}>
            {useLiveAuctionBidFlow && !variantItemActive ? (
              <HoldToBidButton
                label={m.bottomRightLabel}
                disabled={primaryDisabled}
                busy={bidBusy}
                variant="auction"
                compact={compact}
                onHoldStart={onHoldStart}
                onCommit={() => guard(() => runPrimaryLiveCommerceAction())}
              />
            ) : (
              <Pressable
                style={[styles.ctaBidPressable, (primaryDisabled || bidBusy) && styles.ctaDisabled]}
                onPress={onPrimary}
                disabled={primaryDisabled || bidBusy}
                accessibilityRole="button"
                accessibilityLabel={m.bottomRightLabel}
              >
                <LinearGradient
                  colors={['#D946EF', '#8B5CF6', '#6366F1']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.ctaBidGradient, compact && styles.ctaBidGradientCompact]}
                >
                  {bidBusy ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <LiveRoomText
                      style={[styles.ctaBidText, (primaryDisabled || bidBusy) && styles.ctaDisabledText]}
                      numberOfLines={1}
                    >
                      {m.bottomRightLabel}
                    </LiveRoomText>
                  )}
                </LinearGradient>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <WalletSheet
        visible={walletSheetOpen}
        onClose={closeWalletSetup}
        accessToken={accessToken}
        roomId={stream.id}
        initialReadiness={walletReadiness}
        onReadinessChange={(next) => {
          setWalletReadiness(next);
          if (next.paymentReady && next.shippingReady) {
            void refreshRoomSnapshot();
          }
        }}
      />

      {variantItemActive && roomSnap?.activeItemId ? (
        /* Sole buyer PYT/PYD checkout — compact bottom sheet, not a center board */
        <LiveBreakSpotGridSheet
          visible={variantSheetOpen}
          onClose={() => setVariantSheetOpen(false)}
          roomId={stream.id}
          itemId={roomSnap.activeItemId}
          title={roomSnap.activeItemTitle ?? m.itemTitle}
          imageUrl={roomSnap.activeItemImageUrl}
          salesFormat={roomSnap.activeItemSalesFormat ?? 'variant_selection'}
          variants={roomSnap.activeItemVariants ?? []}
          accessToken={accessToken}
          walletReady={walletReady}
          onWalletRequired={() => {
            openWalletSetup('variant_checkout_wallet', walletReadinessFromSnapshot(roomSnap));
          }}
          onPurchased={() => {
            void refreshRoomSnapshot();
          }}
          stripePublishableKey={variantStripePublishableKey}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  floatRoot: {
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.28)',
  },
  androidTint: {
    backgroundColor: 'rgba(10,9,12,0.92)',
  },
  hudBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    pointerEvents: 'none',
  },
  hudInner: {
    paddingHorizontal: spacing.sm,
    paddingTop: 8,
    gap: 5,
  },
  hudInnerCompact: {
    paddingTop: 6,
    gap: 3,
  },
  topBand: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  timer: {
    fontVariant: ['tabular-nums'],
    fontSize: 13,
    fontWeight: '800',
    color: colors.gold,
    letterSpacing: 0.5,
    marginTop: 2,
    minWidth: 48,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  itemTitle: {
    color: 'rgba(255,255,255,0.96)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  categoryType: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  priceBlock: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  currentPrefix: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  currentAmount: {
    color: colors.gold,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginTop: -1,
    fontVariant: ['tabular-nums'],
  },
  metaLine: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: -0.05,
  },
  syncLine: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 12,
  },
  ctaBand: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
    marginTop: 2,
    paddingBottom: 2,
  },
  ctaBandCompact: {
    gap: 5,
    marginTop: 1,
  },
  ctaGhostCompact: {
    paddingVertical: 7,
  },
  ctaGhost: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  ctaGhostText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  ctaShop: {
    width: 40,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  ctaPrimaryWrap: {
    flex: 1.15,
    minWidth: 0,
    minHeight: 44,
    justifyContent: 'center',
  },
  ctaBidPressable: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  ctaBidGradient: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBidGradientCompact: {
    minHeight: 40,
    paddingVertical: 8,
  },
  ctaBidText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  ctaGold: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(212,175,55,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.5)',
    justifyContent: 'center',
  },
  ctaGoldText: {
    color: 'rgba(255,255,255,0.98)',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.15,
  },
  ctaDisabled: {
    opacity: 0.45,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  ctaDisabledText: {
    color: 'rgba(255,255,255,0.55)',
  },
});
