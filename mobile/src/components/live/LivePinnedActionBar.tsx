import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStripe } from '@stripe/stripe-react-native';
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
import {
  createLiveBidIdempotencyKey,
  fetchLiveRoomBuyerSnapshot,
  finalizeOverdueLiveRoomAuctions,
  placeLiveRoomBid,
  type LiveRoomBuyerSnapshot,
} from '../../api/liveRoomBuyerRepository';
import { fetchLiveBuyerPaymentSession } from '../../api/liveBuyerPaymentRepository';
import { purchaseLiveBuyNow, syncLiveBuyNowPurchase } from '../../api/liveBuyNowRepository';
import {
  isWalletIncompleteError,
  isWalletIncompleteReadiness,
  isWalletReadyForLiveBid,
  walletReadinessFromSnapshot,
  type BuyerWalletReadiness,
} from '../../lib/buyerWalletErrors';
import {
  LIVE_AUCTION_BUYER_NOT_STARTED_COPY,
  LIVE_AUCTION_BUYER_TIMER_ENDED_COPY,
} from '../../lib/liveAuctionLotPhase';
import { logLiveBidButtonPress, mustUseLiveBidFlow, isActiveBuyNowBuyerItem } from '../../lib/liveCommerceRouting';
import { mapLivePaymentFailureMessage } from '../../lib/livePaymentFailureCopy';
import { withLivePlaybackCommerceHold } from '../../lib/livePlaybackCommerceHold';
import { logBidControl } from '../../lib/bidControlLog';
import { mergeBuyerSnapshotForOptimisticBid, patchBuyerSnapshotMinNextBid } from '../../lib/liveRoomBuyerSnapshotMerge';
import { liveAuctionMinBidUsd } from '../../lib/liveAuctionBidMath';
import { openWebCommerceUrl, webLiveRoomUrl } from '../../lib/openWebCommerce';
import { logLiveBidBlocked, logWalletSheet } from '../wallet/walletSheetKeyboard';
import { WalletSheet } from '../wallet/WalletSheet';
import type { LiveStackParamList, MainTabParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';
import type { LiveStream } from '../../types';
import { HoldToBidButton } from './HoldToBidButton';
import { LIVE_CLAIM_CTA_GRADIENT } from './liveClaimCtaStyle';
import { resolveBuyerRoomKind, resolveLiveBuyerCommerceHud, formatMoney } from './liveActionModule';
import { fetchLiveVariantCheckoutPreview, type LiveVariantCheckoutPreview } from '../../api/liveVariantCheckoutPreviewRepository';
import { formatPinnedShippingTaxLine } from '../../../../shared/live-pinned-shipping-tax-copy';
import { LiveCustomBidSheet } from './LiveCustomBidSheet';
import { LiveBreakSpotGridSheet } from './LiveBreakSpotGridSheet';
import { SellerBreakSpotBoardSheet } from '../seller/liveOverlay/SellerBreakSpotBoardSheet';
import type { LiveCustomBidPayload } from '../../lib/liveCustomBid';
import {
  isActiveVariantBuyerItem,
  isBuyerVariantRosterClosed,
  featuredBuyerVariant,
  hostPinnedBuyerVariant,
  lowestAvailableVariantPrice,
  type RefreshVariantsResult,
} from '../../lib/liveItemVariant';
import { isVariantSpotAuctionLive, shopVariantCountDuringSpotAuction } from '../../lib/liveVariantSpotCommerce';
import type { LiveSpotTakenCelebration } from '../../lib/liveSpotCelebration';
import { reconcileBuyerSnapshotMonotonic } from '../../lib/liveRoomBuyerSnapshotMerge';
import { computeAuctionRemainingMs, logAuctionTimer } from '../../lib/auctionTimerSync';
import { syncedWallTimeMs } from '../../lib/serverClockSync';
import {
  isCompactLiveRoomLayout,
  LIVE_ROOM_REF_WIDTH,
  liveRoomHudScale,
} from '../../lib/liveRoomUiScale';
import {
  resolveLiveBidFailureDisplay,
  type LiveBidFailureDisplay,
} from '../../lib/liveBidUserErrors';

/** @deprecated Prefer measuring commerce HUD via `onLayout`; used as initial layout estimate only. */
export const LIVE_COMMERCE_OVERLAY_HEIGHT = 118;

const BID_PENDING_SAFETY_MS = 6000;

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
  onRefreshSnapshot?: (opts?: { authoritative?: boolean }) => Promise<LiveRoomBuyerSnapshot | null>;
  /** Server clock skew for auction timer sync. */
  clockSkewMs?: number;
  /** Merge bid HTTP ACK into live snapshot (timer + high bid). */
  mergeBidAck?: (ack: import('../../api/liveRoomBuyerRepository').LiveBidHttpAck) => void;
  /** Instant HUD advance when Hold-to-Bid commits (before HTTP returns). */
  applyOptimisticBid?: (args: {
    itemId: string;
    amountUsd: number;
    leadingBidderId?: string | null;
    leadingBidderUsername?: string | null;
  }) => void;
  /** Roll back optimistic HUD if the bid request fails. */
  replaceRoomSnap?: (snap: LiveRoomBuyerSnapshot | null) => void;
  onBidPlaced?: (amountUsd: number) => void;
  /** Premium in-room toast for outbid / bid failures (replaces harsh system alerts). */
  onBidNotice?: (notice: LiveBidFailureDisplay) => void;
  /** Break rooms: block bid CTAs until disclaimer accepted. */
  participationBlocked?: boolean;
  /** Host stream offline/paused — blocks auctions/bids only. */
  broadcastCommerceBlocked?: boolean;
  /** Host stream offline — blocks Buy Now / shop / spots (pause does not). */
  broadcastPurchaseBlocked?: boolean;
  broadcastCommerceBlockMessage?: string | null;
  broadcastPurchaseBlockMessage?: string | null;
  participationBlockMessage?: string;
  /** Host or assigned moderator — cannot bid/buy in this show. */
  staffCommerceBlocked?: boolean;
  /** Parent can disable feed gestures while wallet overlay is open. */
  onWalletOverlayChange?: (active: boolean) => void;
  /** Stage design width — drives compact HUD sizing on iPhone 15-class screens. */
  layoutWidth?: number;
  /** Exposes in-room wallet opener for rail / external entry points. */
  onRegisterOpenWallet?: (open: (reason?: string) => void) => void;
  onSpotCelebration?: (celebration: LiveSpotTakenCelebration) => void;
  viewerUsername?: string | null;
  /** Signed-in viewer id — optimistic “you’re winning” + floor tracking. */
  viewerUserId?: string | null;
  /** False on off-screen feed slides so hold-to-bid cannot fire on a background room. */
  commerceActive?: boolean;
  /** Vault reveal is on screen — collapse checkout so the roll is visible. */
  vaultRevealActive?: boolean;
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
  applyOptimisticBid,
  replaceRoomSnap,
  onBidPlaced,
  onBidNotice,
  participationBlocked = false,
  broadcastCommerceBlocked = false,
  broadcastPurchaseBlocked = false,
  broadcastCommerceBlockMessage = null,
  broadcastPurchaseBlockMessage = null,
  participationBlockMessage = 'Complete setup in this show before bidding or buying.',
  staffCommerceBlocked = false,
  onWalletOverlayChange,
  layoutWidth,
  onRegisterOpenWallet,
  onSpotCelebration,
  viewerUsername,
  viewerUserId,
  commerceActive = true,
  vaultRevealActive = false,
}: Props) {
  const stackNav = useNavigation<NativeStackNavigationProp<LiveStackParamList>>();
  const tabNav = stackNav.getParent<BottomTabNavigationProp<MainTabParamList>>();
  const stageWidth = layoutWidth ?? LIVE_ROOM_REF_WIDTH;
  const hudScale = liveRoomHudScale(stageWidth);
  const compact = isCompactLiveRoomLayout(stageWidth);
  const hudFs = (base: number) => Math.round(base * hudScale);
  const hudPad = (base: number) => Math.round(base * hudScale);
  const [bidBusy, setBidBusy] = useState(false);
  const [walletSheetOpen, setWalletSheetOpen] = useState(false);
  const [walletOverlayActive, setWalletOverlayActive] = useState(false);
  const walletOverlayOpenRef = useRef(false);
  const bidInFlightRef = useRef(false);
  const bidSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Sync floor so rapid holds don’t wait on React state after optimistic HUD. */
  const holdBidFloorRef = useRef<{
    itemId: string;
    highUsd: number;
    nextMinUsd: number;
    seq: number;
  } | null>(null);
  const holdBidSeqRef = useRef(0);
  const [walletReadiness, setWalletReadiness] = useState<BuyerWalletReadiness | null>(null);
  const [variantSheetOpen, setVariantSheetOpen] = useState(false);
  const [variantSheetInitialId, setVariantSheetInitialId] = useState<string | null>(null);
  const [teamsRosterOpen, setTeamsRosterOpen] = useState(false);
  const [customBidSheetOpen, setCustomBidSheetOpen] = useState(false);
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
  const variantItemActive = isActiveVariantBuyerItem(roomSnap);
  const variantRosterClosed = isBuyerVariantRosterClosed(roomSnap);
  const variantFixedCheckoutActive =
    variantItemActive && !isVariantSpotAuctionLive(roomSnap);

  useEffect(() => {
    if (roomSnap?.lotBidPhase !== 'bidding_open' || !roomSnap.auctionEndsAt) return undefined;
    const id = setInterval(() => setTimerTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [roomSnap?.lotBidPhase, roomSnap?.auctionEndsAt]);

  const autoCloseNudgedItemRef = useRef<string | null>(null);

  useEffect(() => {
    if (!vaultRevealActive) return;
    setVariantSheetOpen(false);
    setVariantSheetInitialId(null);
    setTeamsRosterOpen(false);
  }, [vaultRevealActive]);

  // Same as host: when the break fills / closes, keep the sold team roster available.
  const autoOpenedRosterItemRef = useRef<string | null>(null);
  useEffect(() => {
    const itemId = roomSnap?.activeItemId ?? null;
    if (!variantItemActive || !variantRosterClosed || !itemId) {
      if (!variantRosterClosed) autoOpenedRosterItemRef.current = null;
      return;
    }
    if (autoOpenedRosterItemRef.current === itemId) return;
    autoOpenedRosterItemRef.current = itemId;
    setVariantSheetOpen(false);
    setVariantSheetInitialId(null);
    setTeamsRosterOpen(true);
  }, [variantItemActive, variantRosterClosed, roomSnap?.activeItemId]);

  // New lot → drop local hold floor so we don't bid from a prior item's next-min.
  useEffect(() => {
    const itemId = roomSnap?.activeItemId ?? null;
    if (!itemId || holdBidFloorRef.current?.itemId !== itemId) {
      holdBidFloorRef.current = null;
    }
  }, [roomSnap?.activeItemId, stream.id]);

  // Someone else is high — drop sticky Hold floor so the next bid uses the live min, not our old optimistic floor.
  useEffect(() => {
    if (!viewerUserId || !roomSnap?.activeItemId) return;
    if (!roomSnap.lastHighBidderId || roomSnap.lastHighBidderId === viewerUserId) return;
    if (holdBidFloorRef.current?.itemId === roomSnap.activeItemId) {
      holdBidFloorRef.current = null;
    }
  }, [viewerUserId, roomSnap?.activeItemId, roomSnap?.lastHighBidderId]);

  // FIX 5: close the checkout sheet (and its internal selection/preview state) whenever the
  // host advances to a different pinned lot while it's open, so stale sheet state never couples
  // to the new item's props. Buyer can simply re-open to buy from the now-different item.
  const variantSheetLastActiveItemIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentItemId = roomSnap?.activeItemId ?? null;
    const previousItemId = variantSheetLastActiveItemIdRef.current;
    variantSheetLastActiveItemIdRef.current = currentItemId;
    if (previousItemId == null || previousItemId === currentItemId) return;
    setVariantSheetOpen(false);
    setVariantSheetInitialId(null);
    setTeamsRosterOpen(false);
  }, [roomSnap?.activeItemId]);

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
  const spotAuctionLane = variantItemActive && isVariantSpotAuctionLive(roomSnap);
  const primaryBroadcastBlocked =
    auctionLane || spotAuctionLane ? broadcastCommerceBlocked : broadcastPurchaseBlocked;
  // Auction custom-bid secondary uses auction gate; shop / teams secondary uses purchase gate.
  const secondaryBroadcastBlocked =
    auctionLane || spotAuctionLane
      ? broadcastCommerceBlocked
      : variantFixedCheckoutActive
        ? broadcastPurchaseBlocked
        : false;
  const commerceBlocked =
    walletOverlayActive ||
    walletSheetOpen ||
    variantSheetOpen ||
    teamsRosterOpen ||
    // Custom sheet is a full-screen modal — keep Hold enabled underneath so closing/outbid
    // recovery never leaves the buyer with a dead primary CTA from sheet state alone.
    Boolean(roomSnap?.unresolvedPaymentFailure);
  const commerceInactive = !commerceActive;
  const primaryDisabled =
    commerceInactive ||
    m.buyerPrimaryDisabled === true ||
    staffCommerceBlocked ||
    commerceBlocked ||
    primaryBroadcastBlocked ||
    (participationBlocked && !variantFixedCheckoutActive);
  const secondaryDisabled =
    commerceInactive ||
    m.buyerSecondaryDisabled === true ||
    staffCommerceBlocked ||
    commerceBlocked ||
    secondaryBroadcastBlocked ||
    (participationBlocked && !variantFixedCheckoutActive);
  const padBottom = 4 + Math.min(10, Math.round(bottomSafeInset * (compact ? 0.25 : 0.35)));

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
    console.info('[bid] control reset', { reason, roomId: stream.id });
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
  const useLiveBuyNowFlow = isActiveBuyNowBuyerItem(roomSnap);
  const { confirmPayment } = useStripe();
  const walletReady = useMemo(() => {
    const fromSnap = walletReadinessFromSnapshot(roomSnap);
    const r = walletReadiness ?? fromSnap;
    return Boolean(r?.paymentReady && r?.shippingReady);
  }, [roomSnap, walletReadiness]);

  const variantCheckoutPreviewEnabled = Boolean(
    variantItemActive &&
      walletReady &&
      accessToken &&
      roomSnap?.activeItemId &&
      !isVariantSpotAuctionLive(roomSnap),
  );
  const variantPreviewItemPriceUsd = useMemo(() => {
    if (!variantCheckoutPreviewEnabled || !roomSnap) return 0;
    const variants = roomSnap.activeItemVariants ?? [];
    const pinned = hostPinnedBuyerVariant(variants, roomSnap.activeItemVariantAssignmentMode);
    if (pinned?.priceUsd != null && pinned.priceUsd > 0) return pinned.priceUsd;
    return lowestAvailableVariantPrice(variants) ?? roomSnap.priceUsd ?? roomSnap.startingBidUsd ?? 0;
  }, [roomSnap, variantCheckoutPreviewEnabled]);
  const snapshotVariantCheckoutPreview = useMemo(() => {
    const preview = roomSnap?.variantCheckoutPreview;
    if (!preview || preview.liveRoomItemId !== roomSnap?.activeItemId) return null;
    return preview;
  }, [roomSnap?.activeItemId, roomSnap?.variantCheckoutPreview]);
  const [fetchedVariantCheckoutPreview, setFetchedVariantCheckoutPreview] =
    useState<LiveVariantCheckoutPreview | null>(null);
  const [variantCheckoutPreviewLoading, setVariantCheckoutPreviewLoading] = useState(false);
  // FIX 1: tracks which item the currently-stored fetched preview was requested for, so a
  // preview for a previous item is never left showing while the fresh one is loading.
  const fetchedVariantCheckoutPreviewItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!variantCheckoutPreviewEnabled || variantPreviewItemPriceUsd <= 0 || !accessToken || !roomSnap?.activeItemId) {
      fetchedVariantCheckoutPreviewItemIdRef.current = null;
      setFetchedVariantCheckoutPreview(null);
      setVariantCheckoutPreviewLoading(false);
      return undefined;
    }
    if (
      snapshotVariantCheckoutPreview &&
      Math.abs(snapshotVariantCheckoutPreview.itemPriceUsd - variantPreviewItemPriceUsd) < 0.01
    ) {
      fetchedVariantCheckoutPreviewItemIdRef.current = null;
      setFetchedVariantCheckoutPreview(null);
      setVariantCheckoutPreviewLoading(false);
      return undefined;
    }
    const requestedItemId = roomSnap.activeItemId;
    if (fetchedVariantCheckoutPreviewItemIdRef.current !== requestedItemId) {
      // Active item changed since the last fetched preview — clear the stale total immediately
      // instead of leaving the previous item's preview visible while the fresh one loads.
      setFetchedVariantCheckoutPreview(null);
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    // Mirrors the sheet-side preview loader's retry/catch (`LiveBreakSpotGridSheet.tsx`) — the
    // underlying fetch can THROW on timeout/network error rather than resolve, so a bare `.then()`
    // here (no `.catch()`) left the HUD stuck showing "Calculating…" forever after a failed fetch.
    const loadPreview = () => {
      if (cancelled) return;
      setVariantCheckoutPreviewLoading(true);
      void fetchLiveVariantCheckoutPreview(accessToken, {
        liveRoomId: stream.id,
        itemId: requestedItemId,
        itemPriceUsd: variantPreviewItemPriceUsd,
      })
        .then((preview) => {
          if (cancelled) return;
          if (preview) {
            fetchedVariantCheckoutPreviewItemIdRef.current = requestedItemId;
            setFetchedVariantCheckoutPreview(preview);
            setVariantCheckoutPreviewLoading(false);
            return;
          }
          attempt += 1;
          if (attempt < 4) {
            retryTimer = setTimeout(loadPreview, Math.min(6000, 1200 * attempt));
            return;
          }
          setVariantCheckoutPreviewLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          attempt += 1;
          if (attempt < 4) {
            retryTimer = setTimeout(loadPreview, Math.min(6000, 1200 * attempt));
            return;
          }
          setVariantCheckoutPreviewLoading(false);
        });
    };

    loadPreview();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    accessToken,
    roomSnap?.activeItemId,
    snapshotVariantCheckoutPreview,
    stream.id,
    variantCheckoutPreviewEnabled,
    variantPreviewItemPriceUsd,
  ]);

  // Belt-and-suspenders guard mirroring `snapshotVariantCheckoutPreview`: never surface a fetched
  // preview whose own `liveRoomItemId` disagrees with the currently active item.
  const fetchedVariantCheckoutPreviewForActiveItem = useMemo(() => {
    if (!fetchedVariantCheckoutPreview) return null;
    if (
      fetchedVariantCheckoutPreview.liveRoomItemId &&
      fetchedVariantCheckoutPreview.liveRoomItemId !== roomSnap?.activeItemId
    ) {
      return null;
    }
    return fetchedVariantCheckoutPreview;
  }, [fetchedVariantCheckoutPreview, roomSnap?.activeItemId]);

  const variantCheckoutPreview = snapshotVariantCheckoutPreview ?? fetchedVariantCheckoutPreviewForActiveItem;

  const variantCheckoutMetaLine = variantCheckoutPreview
    ? `Spot ${formatMoney(variantCheckoutPreview.itemPriceUsd)} · ${variantCheckoutPreview.shippingDisplay} · Tax ${variantCheckoutPreview.taxDisplay}`
    : variantCheckoutPreviewEnabled && variantCheckoutPreviewLoading
      ? 'Calculating shipping & tax…'
      : variantItemActive && !walletReady && !isVariantSpotAuctionLive(roomSnap)
        ? 'Add wallet for total with shipping + tax'
        : null;
  const metaLine = variantCheckoutMetaLine ?? m.stateLine ?? null;
  const winningLine = variantCheckoutMetaLine ? null : m.winningLine || null;
  const viewerIsHighBidder = Boolean(
    viewerUserId && roomSnap?.lastHighBidderId && viewerUserId === roomSnap.lastHighBidderId,
  );

  // Shipping + tax line for the active auction / buy-now pinned lot (PYT/PYD spots use the variant
  // preview above). Server only attaches this for non-variant lots when the buyer has an address.
  const pinnedShippingTaxLine = useMemo(() => {
    const p = roomSnap?.activeItemShippingTax;
    if (!p || !roomSnap?.activeItemId || p.liveRoomItemId !== roomSnap.activeItemId) return null;
    if (variantCheckoutPreview) return null;
    return formatPinnedShippingTaxLine({
      isAuction: p.isAuction,
      shippingDisplay: p.shippingDisplay,
      taxApplies: p.taxApplies,
      taxUsd: p.taxUsd,
    });
  }, [roomSnap?.activeItemId, roomSnap?.activeItemShippingTax, variantCheckoutPreview]);
  const hudCurrentPrefix = variantCheckoutPreview ? 'Total' : m.currentPrefix;
  const hudCurrentAmount = variantCheckoutPreview
    ? formatMoney(variantCheckoutPreview.chargeNowUsd)
    : variantCheckoutPreviewEnabled && variantCheckoutPreviewLoading
      ? '…'
      : m.currentAmount;

  const refreshRoomSnapshot = useCallback(
    async (opts?: { authoritative?: boolean }): Promise<LiveRoomBuyerSnapshot | null> => {
      if (onRefreshSnapshot) return onRefreshSnapshot(opts);
      setLocalSyncRefreshing(true);
      try {
        const snap = await fetchLiveRoomBuyerSnapshot(accessToken, stream.id);
        setLocalRoomSnap((prev) => {
          if (opts?.authoritative) return snap;
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
    },
    [accessToken, onRefreshSnapshot, stream.id],
  );

  useEffect(() => {
    if (usingExternalSync) return undefined;
    void refreshRoomSnapshot();
    const pollMs = buyerKind === 'auction' ? 12_000 : 20_000;
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

  const tryPlaceLiveBid = useCallback(async (
    bid?: LiveCustomBidPayload,
    opts?: { rethrowOnFailure?: boolean; holdOnly?: boolean },
  ) => {
    if (!commerceActive) {
      logBidControl('blocked', { reason: 'commerce inactive slide' });
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
    if (broadcastCommerceBlocked) {
      logBidControl('blocked', { reason: 'broadcast auction blocked' });
      Alert.alert(
        'Bidding paused',
        broadcastCommerceBlockMessage ?? 'Bidding is paused until the host is back on air.',
      );
      return;
    }
    if (participationBlocked) {
      logBidControl('blocked', { reason: 'participation blocked' });
      Alert.alert('Not ready yet', participationBlockMessage);
      return;
    }

    const holdOnly = opts?.holdOnly === true;
    // Custom / sheet bids stay serialized. Hold-to-Bid is fire-and-forget (Whatnot-style).
    if (!holdOnly && bidInFlightRef.current) {
      logBidControl('ignored', { reason: 'bid in flight', hasCustomPayload: bid != null });
      return;
    }

    if (!holdOnly) {
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
    } else {
      console.info('[bid] hold submit', { roomId: stream.id });
    }

    let openedWallet = false;
    let rollbackSnap: LiveRoomBuyerSnapshot | null = null;
    let didOptimistic = false;
    let fireAndForget = false;

    const applyFloorFromFailure = (display: LiveBidFailureDisplay) => {
      holdBidFloorRef.current = null;
      const min = display.minNextBidUsd;
      if (min == null || !Number.isFinite(min) || min <= 0) return;
      if (replaceRoomSnap) {
        const base = roomSnap;
        if (base) replaceRoomSnap(patchBuyerSnapshotMinNextBid(base, min));
      } else {
        setLocalRoomSnap((prev) => (prev ? patchBuyerSnapshotMinNextBid(prev, min) : prev));
      }
    };

    try {
      // Prefer the live in-memory snapshot so Hold-to-Bid does not wait on a full GET first.
      const localUsable =
        roomSnap != null &&
        roomSnap.status === 'live' &&
        Boolean(roomSnap.activeItemId) &&
        roomSnap.lotBidPhase === 'bidding_open' &&
        typeof roomSnap.minNextBidUsd === 'number' &&
        Number.isFinite(roomSnap.minNextBidUsd) &&
        roomSnap.minNextBidUsd > 0;
      const snap = localUsable ? roomSnap : (await refreshRoomSnapshot()) ?? roomSnap;
      if (!snap) {
        logBidControl('blocked', { reason: 'snapshot unavailable' });
        Alert.alert('Could not load room', 'Try again or open the live room in your browser.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open live room', onPress: openFullLiveRoom },
        ]);
        return;
      }

      // Hot path: use in-memory readiness. Only fetch when custom-bid path and unknown.
      const walletFromSnap = walletReadinessFromSnapshot(snap);
      let walletForBid: BuyerWalletReadiness | null =
        (isWalletReadyForLiveBid(walletReadiness) ? walletReadiness : null) ?? walletFromSnap;
      if (
        !holdOnly &&
        !isWalletReadyForLiveBid(walletForBid) &&
        !isWalletIncompleteReadiness(walletForBid)
      ) {
        const paymentSession = await fetchLiveBuyerPaymentSession(accessToken, stream.id);
        if (paymentSession) {
          walletForBid = {
            paymentReady: paymentSession.paymentReady,
            shippingReady: paymentSession.shippingReady,
          };
        }
      }
      if (isWalletIncompleteReadiness(walletForBid)) {
        logBidControl('blocked', { reason: 'wallet incomplete' });
        openedWallet = openWalletSetup(
          'precheck_incomplete',
          walletForBid ?? { paymentReady: false, shippingReady: false },
        );
        return;
      }
      // Hold path: unknown wallet still fires — server 402 opens Wallet if needed.

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
      const snapMin = snap.minNextBidUsd;
      if (snapMin == null || !Number.isFinite(snapMin) || snapMin <= 0) {
        logBidControl('blocked', { reason: 'invalid min bid', amount: snapMin });
        Alert.alert('Could not bid', 'Minimum bid is unavailable. Try the full live room.');
        return;
      }
      const floor =
        holdBidFloorRef.current?.itemId === snap.activeItemId
          ? holdBidFloorRef.current.nextMinUsd
          : 0;
      const minNext = Math.max(snapMin, floor);
      const amountUsd = holdOnly ? minNext : (bid?.amountUsd ?? minNext);
      const listingLot = Boolean(snap.activeItemListingId?.trim());
      let maxProxyUsd = bid?.maxProxyUsd;
      // Hold / primary instant bids cap proxy at the placed amount so an older max bid
      // cannot keep auto-raising the buyer on this lot. Exact custom omits maxProxy.
      if (maxProxyUsd == null && !listingLot && (holdOnly || bid == null)) {
        maxProxyUsd = amountUsd;
      }
      if (amountUsd + 0.001 < minNext) {
        logBidControl('blocked', { reason: 'below min bid', amountUsd, minNext });
        Alert.alert('Could not bid', `Minimum bid is $${minNext.toFixed(2)}.`);
        return;
      }
      if (maxProxyUsd != null && maxProxyUsd + 0.001 < amountUsd) {
        logBidControl('blocked', { reason: 'max below bid', amountUsd, maxProxyUsd });
        Alert.alert('Could not bid', 'Max bid must be at least your bid amount.');
        return;
      }
      logBidControl('commit', {
        roomId: stream.id,
        itemId: snap.activeItemId,
        amountUsd,
        maxProxyUsd: maxProxyUsd ?? null,
        holdOnly,
        usedLocalSnapshot: localUsable,
        fireAndForget: holdOnly,
      });

      const itemId = snap.activeItemId;
      const optimisticArgs = {
        itemId,
        amountUsd,
        leadingBidderId: viewerUserId ?? undefined,
        leadingBidderUsername: viewerUsername ?? undefined,
      };

      if (holdOnly || bid == null) {
        rollbackSnap = roomSnap;
        if (applyOptimisticBid) {
          applyOptimisticBid(optimisticArgs);
        } else {
          setLocalRoomSnap((prev) => {
            if (!prev) return prev;
            return (
              mergeBuyerSnapshotForOptimisticBid(prev, {
                ...optimisticArgs,
                wallNowMs: Date.now(),
              }) ?? prev
            );
          });
        }
        didOptimistic = true;
        const nextMin = liveAuctionMinBidUsd({
          currentBidUsd: amountUsd,
          startingBidUsd: snap.startingBidUsd,
          priceUsd: snap.priceUsd,
          lastHighBidderId: viewerUserId ?? snap.lastHighBidderId,
        });
        const seq = ++holdBidSeqRef.current;
        holdBidFloorRef.current = {
          itemId,
          highUsd: amountUsd,
          nextMinUsd: nextMin,
          seq,
        };
        if (holdOnly) {
          onBidPlaced?.(
            bid?.maxProxyUsd != null && bid.maxProxyUsd > amountUsd + 0.001
              ? bid.maxProxyUsd
              : amountUsd,
          );
        }
      }

      if (holdOnly) {
        // Unlock immediately — HTTP confirms in the background. Server remains authority.
        fireAndForget = true;
        const token = accessToken;
        const roomId = stream.id;
        const seq = holdBidSeqRef.current;
        const idempotencyKey = createLiveBidIdempotencyKey();
        void placeLiveRoomBid({
          accessToken: token,
          roomId,
          itemId,
          amountUsd,
          maxProxyUsd,
          idempotencyKey,
        })
          .then((ack) => {
            mergeBidAck?.(ack);
            console.info('[bid] hold ack', {
              roomId,
              itemId,
              amountUsd,
              maxProxyUsd: maxProxyUsd ?? null,
            });
            void refreshRoomSnapshot()
              .then((snapAfter) =>
                console.info('[bid] fallback refresh complete', { ok: snapAfter != null }),
              )
              .catch(() => {});
          })
          .catch((e) => {
            console.info('[bid] hold error', {
              roomId,
              message: e instanceof Error ? e.message : 'unknown',
              code: e instanceof Error ? (e as Error & { code?: string }).code : undefined,
            });
            if (holdBidFloorRef.current?.seq === seq) {
              holdBidFloorRef.current = null;
            }
            void refreshRoomSnapshot({ authoritative: true }).catch(() => {});
            if (isWalletIncompleteError(e)) {
              logBidControl('blocked', { reason: 'wallet incomplete api 402' });
              if (!walletOverlayOpenRef.current && !walletSheetOpen) {
                openWalletSetup('api_402', {
                  paymentReady: e.paymentReady,
                  shippingReady: e.shippingReady,
                });
              }
              return;
            }
            if (
              e instanceof Error &&
              (e as Error & { code?: string }).code === 'LIVE_PAYMENT_BLOCKED'
            ) {
              logBidControl('blocked', { reason: 'payment failure lockout' });
              return;
            }
            const display = resolveLiveBidFailureDisplay(e);
            logBidControl('blocked', {
              reason: 'bid failed',
              kind: display.kind,
              message: display.message,
            });
            applyFloorFromFailure(display);
            if (display.kind === 'outbid') {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
                () => {},
              );
            }
            onBidNotice?.(display);
          });
        return;
      }

      const ack = await placeLiveRoomBid({
        accessToken,
        roomId: stream.id,
        itemId,
        amountUsd,
        maxProxyUsd,
        idempotencyKey: createLiveBidIdempotencyKey(),
      });
      mergeBidAck?.(ack);
      didOptimistic = false;
      rollbackSnap = null;
      resetBidControl('bid_ack');
      console.info('[bid] submit success', {
        roomId: stream.id,
        itemId,
        amountUsd,
        maxProxyUsd: maxProxyUsd ?? null,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onBidPlaced?.(
        bid?.maxProxyUsd != null && bid.maxProxyUsd > amountUsd + 0.001
          ? bid.maxProxyUsd
          : amountUsd,
      );
      setCustomBidSheetOpen(false);
      void refreshRoomSnapshot()
        .then((snapAfter) => console.info('[bid] fallback refresh complete', { ok: snapAfter != null }))
        .catch(() => {});
    } catch (e) {
      console.info('[bid] submit error', {
        roomId: stream.id,
        message: e instanceof Error ? e.message : 'unknown',
        code: e instanceof Error ? (e as Error & { code?: string }).code : undefined,
      });
      if (didOptimistic) {
        if (rollbackSnap) {
          replaceRoomSnap?.(rollbackSnap);
          if (!replaceRoomSnap) setLocalRoomSnap(rollbackSnap);
        }
        void refreshRoomSnapshot({ authoritative: true }).catch(() => {});
      }
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
        await refreshRoomSnapshot({ authoritative: true });
        return;
      }
      await refreshRoomSnapshot({ authoritative: true });
      const display = resolveLiveBidFailureDisplay(e);
      logBidControl('blocked', { reason: 'bid failed', kind: display.kind, message: display.message });
      applyFloorFromFailure(display);
      if (display.kind === 'outbid') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
      onBidNotice?.(display);
      if (opts?.rethrowOnFailure) {
        throw new Error(display.message);
      }
    } finally {
      if (fireAndForget) {
        return;
      }
      if (openedWallet) {
        bidInFlightRef.current = false;
        setBidBusy(false);
        logBidControl('reset', { reason: 'wallet_opened', roomId: stream.id });
        console.info('[bid] control reset', { reason: 'wallet_opened', roomId: stream.id });
      } else if (!walletOverlayOpenRef.current && bidInFlightRef.current) {
        resetBidControl('bid_complete');
      }
    }
  }, [
    accessToken,
    onRequireAuth,
    onBidPlaced,
    onBidNotice,
    openFullLiveRoom,
    openWalletSetup,
    refreshRoomSnapshot,
    broadcastCommerceBlocked,
    broadcastCommerceBlockMessage,
    participationBlocked,
    participationBlockMessage,
    roomSnap,
    stream.id,
    walletSheetOpen,
    walletReadiness,
    resetBidControl,
    mergeBidAck,
    applyOptimisticBid,
    replaceRoomSnap,
    commerceActive,
    viewerUserId,
    viewerUsername,
  ]);

  const onAuctionHoldStart = useCallback(() => {
    if (!commerceActive) return false;
    // Hold path is fire-and-forget — never block the next hold on a prior HTTP ACK.
    if (!accessToken) {
      onRequireAuth?.();
      return false;
    }
    if (primaryDisabled) return false;
    if (broadcastCommerceBlocked) {
      Alert.alert(
        'Bidding paused',
        broadcastCommerceBlockMessage ?? 'Bidding is paused until the host is back on air.',
      );
      return false;
    }
    if (participationBlocked) {
      Alert.alert('Not ready yet', participationBlockMessage);
      return false;
    }
    return true;
  }, [
    accessToken,
    broadcastCommerceBlocked,
    broadcastCommerceBlockMessage,
    commerceActive,
    onRequireAuth,
    participationBlocked,
    participationBlockMessage,
    primaryDisabled,
  ]);

  const onAuctionHoldCommit = useCallback(() => {
    guard(() => {
      if (staffCommerceBlocked) {
        Alert.alert(
          'Not available',
          'Hosts and moderators cannot bid or buy items in this show.',
        );
        return;
      }
      logLiveBidButtonPress({
        roomId: stream.id,
        activeItemId: roomSnap?.activeItemId ?? null,
        auctionLane,
        useLiveAuctionBidFlow,
        selectedAction: 'live_bid',
        bottomRightLabel: m.bottomRightLabel,
        bottomRightIsSlide: m.bottomRightIsSlide,
        roomType: roomSnap?.roomType ?? null,
        lotBidPhase: roomSnap?.lotBidPhase ?? null,
      });
      void tryPlaceLiveBid(undefined, { holdOnly: true });
    });
  }, [
    auctionLane,
    guard,
    m.bottomRightIsSlide,
    m.bottomRightLabel,
    roomSnap?.activeItemId,
    roomSnap?.lotBidPhase,
    roomSnap?.roomType,
    staffCommerceBlocked,
    stream.id,
    tryPlaceLiveBid,
    useLiveAuctionBidFlow,
  ]);

  const tryPurchaseLiveBuyNow = useCallback(async () => {
    if (!accessToken) {
      onRequireAuth?.();
      return;
    }
    if (broadcastPurchaseBlocked) {
      Alert.alert(
        'Not available',
        broadcastPurchaseBlockMessage ?? 'Purchases are paused until the host reconnects.',
      );
      return;
    }
    if (participationBlocked) {
      Alert.alert('Not ready yet', participationBlockMessage);
      return;
    }
    if (bidInFlightRef.current || bidBusy) return;

    bidInFlightRef.current = true;
    setBidBusy(true);
    let openedWallet = false;
    try {
      const snap = roomSnap ?? (await refreshRoomSnapshot());
      if (!snap?.activeItemId) {
        Alert.alert('Nothing to buy', 'No item is live right now.');
        return;
      }
      if (snap.status !== 'live') {
        Alert.alert('Not live', 'This show is not live yet.');
        return;
      }
      const walletFromSnap = walletReadinessFromSnapshot(snap);
      if (walletFromSnap && isWalletIncompleteReadiness(walletFromSnap)) {
        openedWallet = openWalletSetup('precheck_incomplete', walletFromSnap);
        return;
      }
      const paymentSession = await fetchLiveBuyerPaymentSession(accessToken, stream.id);
      const res = await purchaseLiveBuyNow({
        accessToken,
        liveRoomId: stream.id,
        itemId: snap.activeItemId,
        paymentMethodId: paymentSession?.activePaymentMethodId ?? undefined,
      });
      if (!res.ok) {
        if (res.walletIncomplete) {
          if (!walletOverlayOpenRef.current && !walletSheetOpen) {
            openedWallet = openWalletSetup('api_402');
          }
          return;
        }
        Alert.alert(
          'Could not complete purchase',
          mapLivePaymentFailureMessage(res.error, res.code) + (res.paymentFailed ? ' Item was not sold.' : ''),
        );
        if (res.paymentFailed) void refreshRoomSnapshot();
        return;
      }
      if ('paid' in res) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        void refreshRoomSnapshot();
        return;
      }
      if ('requiresAction' in res) {
        const conf = await withLivePlaybackCommerceHold(() =>
          confirmPayment(res.clientSecret, { paymentMethodType: 'Card' }),
        );
        if (conf.error) {
          Alert.alert('Payment verification failed', mapLivePaymentFailureMessage(conf.error.message, conf.error.code));
          return;
        }
        const synced = await syncLiveBuyNowPurchase({
          accessToken,
          liveRoomId: stream.id,
          itemId: snap.activeItemId,
          orderId: res.orderId,
        });
        if (synced.ok && 'paid' in synced) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          void refreshRoomSnapshot();
          return;
        }
        Alert.alert(
          'Payment processing',
          !synced.ok
            ? mapLivePaymentFailureMessage(synced.error, synced.code)
            : 'Payment is still processing — pull to refresh the room.',
        );
        return;
      }
      if ('processing' in res) {
        Alert.alert('Payment processing', 'Your payment is processing — pull to refresh the room.');
        void refreshRoomSnapshot();
      }
    } catch (e) {
      if (isWalletIncompleteError(e)) {
        if (!walletOverlayOpenRef.current && !walletSheetOpen) {
          openedWallet = openWalletSetup('api_402', {
            paymentReady: e.paymentReady,
            shippingReady: e.shippingReady,
          });
        }
        return;
      }
      Alert.alert('Could not complete purchase', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      if (!openedWallet && !walletOverlayOpenRef.current) {
        resetBidControl('buy_now_complete');
      } else if (openedWallet) {
        bidInFlightRef.current = false;
        setBidBusy(false);
      }
    }
  }, [
    accessToken,
    bidBusy,
    confirmPayment,
    onRequireAuth,
    openFullLiveRoom,
    openWalletSetup,
    broadcastPurchaseBlocked,
    broadcastPurchaseBlockMessage,
    participationBlocked,
    participationBlockMessage,
    refreshRoomSnapshot,
    resetBidControl,
    roomSnap,
    stream.id,
    walletSheetOpen,
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
      if (isVariantSpotAuctionLive(roomSnap)) {
        if (useLiveAuctionBidFlow) {
          void tryPlaceLiveBid();
        }
        return;
      }
      // Break closed — open the same sold roster board the host uses.
      if (variantRosterClosed) {
        setVariantSheetOpen(false);
        setTeamsRosterOpen(true);
        return;
      }
      if (broadcastPurchaseBlocked) {
        Alert.alert(
          'Not available',
          broadcastPurchaseBlockMessage ?? 'Purchases are paused until the host reconnects.',
        );
        return;
      }
      if (participationBlocked) {
        Alert.alert('Not ready yet', participationBlockMessage);
        return;
      }
      if (!walletReady) {
        const walletFromSnap = walletReadinessFromSnapshot(roomSnap);
        openWalletSetup('variant_checkout', walletFromSnap ?? undefined);
        return;
      }
      setVariantSheetInitialId(m.buyerPinnedVariantId ?? featuredBuyerVariant(roomSnap)?.id ?? null);
      setVariantSheetOpen(true);
      void refreshRoomSnapshot();
      return;
    }

    // Scheduled pre-sale: Claim Team with no pinned lot → open Shop lineup.
    if (m.showShopButton && /claim (team|division)/i.test(m.bottomRightLabel)) {
      if (onOpenInlineShop) onOpenInlineShop();
      return;
    }

    if (useLiveBuyNowFlow) {
      void tryPurchaseLiveBuyNow();
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
    m.showShopButton,
    onOpenInlineShop,
    roomSnap?.activeItemId,
    roomSnap?.lotBidPhase,
    roomSnap?.roomType,
    stream.id,
    staffCommerceBlocked,
    tryPlaceLiveBid,
    tryPurchaseLiveBuyNow,
    useLiveBuyNowFlow,
    variantItemActive,
    variantRosterClosed,
    useLiveAuctionBidFlow,
    walletSheetOpen,
    m.buyerPinnedVariantId,
    roomSnap?.activeItemVariantAssignmentMode,
    roomSnap?.activeItemVariants,
    broadcastPurchaseBlocked,
    broadcastPurchaseBlockMessage,
    participationBlocked,
    participationBlockMessage,
    walletReady,
    openWalletSetup,
  ]);

  const onSecondary = () => {
    if (secondaryDisabled) return;
    guard(() => {
      if (variantItemActive && !isVariantSpotAuctionLive(roomSnap)) {
        if (variantRosterClosed || m.bottomLeftLabel === 'Teams') {
          setVariantSheetOpen(false);
          setTeamsRosterOpen(true);
          return;
        }
        if (m.bottomLeftLabel === 'All teams') {
          setVariantSheetInitialId(null);
          setVariantSheetOpen(true);
          return;
        }
      }
      if (useLiveAuctionBidFlow && roomSnap?.lotBidPhase === 'bidding_open') {
        setCustomBidSheetOpen(true);
        return;
      }
    });
  };

  const submitCustomBid = useCallback(
    async (payload: LiveCustomBidPayload) => {
      await tryPlaceLiveBid(payload, { rethrowOnFailure: true });
    },
    [tryPlaceLiveBid],
  );
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
      if (variantItemActive) {
        if (variantRosterClosed) {
          setTeamsRosterOpen(true);
          return;
        }
        setVariantSheetInitialId(null);
        setVariantSheetOpen(true);
        return;
      }
      if (onOpenInlineShop) onOpenInlineShop();
      else tabNav?.navigate('Marketplace');
    });

  return (
    <View
      style={[styles.floatRoot, { paddingBottom: padBottom }]}
      pointerEvents={commerceInactive ? 'none' : commerceBlocked ? 'box-none' : 'auto'}
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
          <LiveRoomText style={[styles.timer, { fontSize: hudFs(13) }]}>
            {m.timerMmSs}
          </LiveRoomText>
          <View style={styles.titleBlock}>
            <LiveRoomText style={[styles.itemTitle, { fontSize: hudFs(compact ? 11 : 12) }]} numberOfLines={1}>
              {m.itemTitle}
            </LiveRoomText>
            <LiveRoomText style={[styles.categoryType, { fontSize: hudFs(10) }]} numberOfLines={1}>
              {m.categoryType}
            </LiveRoomText>
          </View>
          <View style={styles.priceBlock}>
            <LiveRoomText style={[styles.currentPrefix, { fontSize: hudFs(9) }]}>{hudCurrentPrefix}</LiveRoomText>
            <LiveRoomText
              style={[
                styles.currentAmount,
                { fontSize: hudFs(20) },
                variantCheckoutPreview ? styles.currentAmountCheckout : null,
              ]}
            >
              {hudCurrentAmount}
            </LiveRoomText>
          </View>
        </View>

        {winningLine ? (
          <LiveRoomText
            style={[
              styles.winningLine,
              { fontSize: hudFs(compact ? 13 : 14) },
              viewerIsHighBidder ? styles.winningLineSelf : null,
            ]}
            numberOfLines={1}
          >
            {viewerIsHighBidder ? "You're winning" : winningLine}
          </LiveRoomText>
        ) : null}
        {metaLine ? (
          <LiveRoomText style={[styles.metaLine, { fontSize: hudFs(10) }]} numberOfLines={1}>
            {metaLine}
          </LiveRoomText>
        ) : null}
        {pinnedShippingTaxLine ? (
          <LiveRoomText style={[styles.metaLine, { fontSize: hudFs(10), opacity: 0.92 }]} numberOfLines={1}>
            {pinnedShippingTaxLine}
          </LiveRoomText>
        ) : null}
        {auctionLane && signedIn ? (
          <LiveRoomText style={[styles.syncLine, { fontSize: hudFs(9) }]} numberOfLines={compact ? 1 : 2}>
            {syncStatusLine ?? 'Syncing auction state from the vault…'}
          </LiveRoomText>
        ) : null}

        <View style={[styles.ctaBand, compact && styles.ctaBandCompact]}>
          <Pressable
            style={[
              styles.ctaGhost,
              compact && styles.ctaGhostCompact,
              { paddingVertical: hudPad(compact ? 7 : 8) },
              secondaryDisabled && styles.ctaDisabled,
            ]}
            onPress={onSecondary}
            disabled={secondaryDisabled}
          >
            <LiveRoomText
              style={[styles.ctaGhostText, { fontSize: hudFs(11) }, secondaryDisabled && styles.ctaDisabledText]}
              numberOfLines={1}
            >
              {m.bottomLeftLabel}
            </LiveRoomText>
          </Pressable>

          {m.showShopButton ? (
            <Pressable
              style={[styles.ctaShop, { width: hudPad(40) }]}
              onPress={onShop}
              accessibilityLabel={m.shopButtonLabel}
            >
              <Ionicons name="bag-handle-outline" size={hudFs(20)} color="rgba(255,255,255,0.88)" />
            </Pressable>
          ) : null}

          <View style={[styles.ctaPrimaryWrap, { minHeight: hudPad(44) }]}>
            {useLiveAuctionBidFlow && (!variantItemActive || isVariantSpotAuctionLive(roomSnap)) ? (
              <HoldToBidButton
                label={m.bottomRightLabel}
                disabled={primaryDisabled}
                busy={bidBusy}
                variant="auction"
                compact={compact}
                onHoldStart={onAuctionHoldStart}
                onCommit={onAuctionHoldCommit}
              />
            ) : (
              <Pressable
                style={[styles.ctaBidPressable, { minHeight: hudPad(44) }, (primaryDisabled || bidBusy) && styles.ctaDisabled]}
                onPress={onPrimary}
                disabled={primaryDisabled || bidBusy}
                accessibilityRole="button"
                accessibilityLabel={m.bottomRightLabel}
              >
                <LinearGradient
                  colors={
                    useLiveBuyNowFlow
                      ? ['#E8C872', '#D4AF37', '#B8860B']
                      : [...LIVE_CLAIM_CTA_GRADIENT]
                  }
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[
                    styles.ctaBidGradient,
                    compact && styles.ctaBidGradientCompact,
                    { minHeight: hudPad(44), paddingVertical: hudPad(compact ? 8 : 10) },
                  ]}
                >
                  {bidBusy ? (
                    <View style={styles.ctaProcessingRow}>
                      <ActivityIndicator
                        color={useLiveBuyNowFlow ? '#18181b' : '#fff'}
                        size="small"
                      />
                      <LiveRoomText
                        style={[
                          styles.ctaBidText,
                          { fontSize: hudFs(11) },
                          useLiveBuyNowFlow && styles.ctaBuyNowText,
                        ]}
                        numberOfLines={1}
                      >
                        Processing
                      </LiveRoomText>
                    </View>
                  ) : (
                    <LiveRoomText
                      style={[
                        styles.ctaBidText,
                        { fontSize: hudFs(11) },
                        useLiveBuyNowFlow && styles.ctaBuyNowText,
                        (primaryDisabled || bidBusy) && styles.ctaDisabledText,
                      ]}
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

      {useLiveAuctionBidFlow && roomSnap?.minNextBidUsd != null ? (
        <LiveCustomBidSheet
          visible={customBidSheetOpen}
          onClose={() => setCustomBidSheetOpen(false)}
          minNextBidUsd={roomSnap.minNextBidUsd}
          currentBidUsd={roomSnap.currentBidUsd}
          reserveSupported
          busy={bidBusy}
          onSubmit={submitCustomBid}
        />
      ) : null}

      {variantItemActive && roomSnap?.activeItemId ? (
        /* Buyer PYT/PYD checkout — compact bottom sheet while spots are still open */
        <LiveBreakSpotGridSheet
          visible={variantSheetOpen}
          onClose={() => {
            setVariantSheetOpen(false);
            setVariantSheetInitialId(null);
          }}
          roomId={stream.id}
          itemId={roomSnap.activeItemId}
          title={roomSnap.activeItemTitle ?? m.itemTitle}
          imageUrl={roomSnap.activeItemImageUrl}
          salesFormat={roomSnap.activeItemSalesFormat ?? 'variant_selection'}
          variantAssignmentMode={roomSnap.activeItemVariantAssignmentMode ?? 'pick'}
          variants={roomSnap.activeItemVariants ?? []}
          initialVariantId={variantSheetInitialId}
          excludeVariantIds={
            isVariantSpotAuctionLive(roomSnap) && roomSnap.auctionVariantId
              ? [roomSnap.auctionVariantId]
              : undefined
          }
          accessToken={accessToken}
          walletReady={walletReady}
          onWalletRequired={() => {
            openWalletSetup('variant_checkout_wallet', walletReadinessFromSnapshot(roomSnap));
          }}
          onPurchased={() => {
            setVariantSheetOpen(false);
            setVariantSheetInitialId(null);
            void refreshRoomSnapshot();
          }}
          onSpotCelebration={onSpotCelebration}
          viewerUsername={viewerUsername}
          onRoomRefresh={() => void refreshRoomSnapshot()}
          onRefreshVariants={async (): Promise<RefreshVariantsResult> => {
            // FIX 2: pull a fresh room snapshot so pick-mode checkout re-validates spot
            // availability against server-authoritative data immediately before charging,
            // instead of trusting the (possibly stale) `variants` prop snapshot. Distinguishes
            // "the lot changed" from "the refresh failed" so the sheet can abort both cases
            // instead of collapsing them into one nullable result (2026-07 overcharge gap fix).
            const requestedItemId = roomSnap.activeItemId;
            let snap: LiveRoomBuyerSnapshot | null;
            try {
              snap = await refreshRoomSnapshot();
            } catch {
              snap = null;
            }
            if (!snap) return { status: 'fetch_failed' };
            if (snap.activeItemId !== requestedItemId) return { status: 'item_changed' };
            return { status: 'fresh', variants: snap.activeItemVariants ?? [] };
          }}
          seedCheckoutPreview={variantCheckoutPreview}
        />
      ) : null}

      {variantItemActive && roomSnap?.activeItemId ? (
        /* Same sold team board the host uses — read-only for buyers after the break fills. */
        <SellerBreakSpotBoardSheet
          visible={teamsRosterOpen}
          onClose={() => setTeamsRosterOpen(false)}
          viewerUsername={viewerUsername}
          item={{
            id: roomSnap.activeItemId,
            title: roomSnap.activeItemTitle ?? m.itemTitle,
            displayTitle: roomSnap.activeItemTitle ?? m.itemTitle,
            salesFormat: roomSnap.activeItemSalesFormat ?? undefined,
            variantAssignmentMode: roomSnap.activeItemVariantAssignmentMode ?? 'pick',
            variants: roomSnap.activeItemVariants,
          }}
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
  currentAmountCheckout: {
    color: colors.success,
  },
  metaLine: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: -0.05,
  },
  winningLine: {
    color: 'rgba(255,255,255,0.96)',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginTop: 1,
  },
  winningLineSelf: {
    color: colors.gold,
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
  ctaProcessingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaBuyNowText: {
    color: '#18181b',
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
