import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  createLiveBidIdempotencyKey,
  fetchLiveRoomBuyerSnapshot,
  placeLiveRoomBid,
  type LiveRoomBuyerSnapshot,
} from '../../api/liveRoomBuyerRepository';
import {
  LIVE_AUCTION_BUYER_NOT_STARTED_COPY,
  LIVE_AUCTION_BUYER_TIMER_ENDED_COPY,
} from '../../lib/liveAuctionLotPhase';
import { openWebCommerceUrl, webLiveRoomUrl } from '../../lib/openWebCommerce';
import type { LiveStackParamList, MainTabParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';
import type { LiveStream } from '../../types';
import { resolveBuyerRoomKind, resolveLiveBuyerCommerceHud } from './liveActionModule';

/** @deprecated Prefer measuring commerce HUD via `onLayout`; used as initial layout estimate only. */
export const LIVE_COMMERCE_OVERLAY_HEIGHT = 118;

const SLIDE_KNOB = 28;

type SlideProps = {
  onCommit: () => void;
};

function CompactSlideToBid({ onCommit }: SlideProps) {
  const trackW = useRef(1);
  const pan = useRef(new Animated.Value(0)).current;
  const dragStart = useRef(0);
  const maxX = useRef(1);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3,
        onPanResponderGrant: () => {
          pan.stopAnimation((v) => {
            dragStart.current = v;
          });
          maxX.current = Math.max(6, trackW.current - SLIDE_KNOB);
        },
        onPanResponderMove: (_, g) => {
          const next = Math.min(maxX.current, Math.max(0, dragStart.current + g.dx));
          pan.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const pos = Math.min(maxX.current, Math.max(0, dragStart.current + g.dx));
          if (pos >= maxX.current * 0.55) onCommit();
          Animated.spring(pan, { toValue: 0, friction: 9, useNativeDriver: false }).start();
        },
      }),
    [onCommit, pan]
  );

  return (
    <View
      style={styles.slideTrack}
      onLayout={(e) => {
        trackW.current = e.nativeEvent.layout.width;
      }}
      {...panResponder.panHandlers}
    >
      <Text style={styles.slideHint}>Slide to bid</Text>
      <Animated.View style={[styles.slideKnob, { transform: [{ translateX: pan }] }]}>
        <Text style={styles.slideKnobChev}>›</Text>
      </Animated.View>
    </View>
  );
}

type Props = {
  stream: LiveStream;
  bottomSafeInset?: number;
  /** When false, commerce CTAs call `onRequireAuth` instead of acting. */
  signedIn?: boolean;
  onRequireAuth?: () => void;
  /** Opens the in-room shop sheet (same as the rail “Shop” control). */
  onOpenInlineShop?: () => void;
  accessToken?: string;
};

export function LivePinnedActionBar({
  stream,
  bottomSafeInset = 0,
  signedIn = true,
  onRequireAuth,
  onOpenInlineShop,
  accessToken,
}: Props) {
  const stackNav = useNavigation<NativeStackNavigationProp<LiveStackParamList>>();
  const tabNav = stackNav.getParent<BottomTabNavigationProp<MainTabParamList>>();
  const [bidBusy, setBidBusy] = useState(false);
  const [roomSnap, setRoomSnap] = useState<LiveRoomBuyerSnapshot | null>(null);
  const [syncRefreshing, setSyncRefreshing] = useState(false);
  const buyerKind = useMemo(() => resolveBuyerRoomKind(roomSnap, stream), [roomSnap, stream]);
  const m = useMemo(() => resolveLiveBuyerCommerceHud(stream, roomSnap), [stream, roomSnap]);
  const auctionLane = buyerKind === 'auction';
  const primaryDisabled = m.buyerPrimaryDisabled === true;
  const secondaryDisabled = m.buyerSecondaryDisabled === true;
  const padBottom = 4 + Math.min(10, Math.round(bottomSafeInset * 0.35));
  const metaLine = [m.winningLine, m.stateLine].filter(Boolean).join(' · ');

  const guard = (fn: () => void) => {
    if (!signedIn) {
      onRequireAuth?.();
      return;
    }
    fn();
  };

  const goInitiateTrade = () => {
    tabNav?.navigate('TradeCenter', { screen: 'InitiateTrade', params: {} });
  };

  const refreshRoomSnapshot = useCallback(async (): Promise<LiveRoomBuyerSnapshot | null> => {
    setSyncRefreshing(true);
    try {
      const snap = await fetchLiveRoomBuyerSnapshot(accessToken, stream.id);
      setRoomSnap(snap);
      return snap;
    } catch {
      return null;
    } finally {
      setSyncRefreshing(false);
    }
  }, [accessToken, stream.id]);

  useEffect(() => {
    void refreshRoomSnapshot();
    const pollMs = buyerKind === 'auction' ? 4000 : 12000;
    const id = setInterval(() => {
      void refreshRoomSnapshot();
    }, pollMs);
    return () => clearInterval(id);
  }, [buyerKind, refreshRoomSnapshot]);

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
    if (!accessToken) {
      onRequireAuth?.();
      return;
    }
    if (bidBusy) return;
    setBidBusy(true);
    try {
      const snap = roomSnap ?? (await refreshRoomSnapshot());
      if (!snap) {
        Alert.alert('Could not load room', 'Try again or open the live room in your browser.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open live room', onPress: openFullLiveRoom },
        ]);
        return;
      }
      if (snap.status !== 'live' || !snap.activeItemId) {
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
        Alert.alert('Bidding closed', LIVE_AUCTION_BUYER_TIMER_ENDED_COPY, [
          { text: 'OK', style: 'cancel' },
          { text: 'Open live room', onPress: openFullLiveRoom },
        ]);
        return;
      }
      if (snap.lotBidPhase !== 'bidding_open') {
        Alert.alert('Bidding not open yet', LIVE_AUCTION_BUYER_NOT_STARTED_COPY, [
          { text: 'OK', style: 'cancel' },
          { text: 'Open live room', onPress: openFullLiveRoom },
        ]);
        return;
      }
      const amount = snap.minNextBidUsd;
      if (amount == null || !Number.isFinite(amount) || amount <= 0) {
        Alert.alert('Could not bid', 'Minimum bid is unavailable. Try the full live room.');
        return;
      }
      await placeLiveRoomBid({
        accessToken,
        roomId: stream.id,
        itemId: snap.activeItemId,
        amountUsd: amount,
        idempotencyKey: createLiveBidIdempotencyKey(),
      });
      await refreshRoomSnapshot();
      Alert.alert('Bid placed', `Your bid of $${amount.toLocaleString('en-US')} was recorded.`);
    } catch (e) {
      Alert.alert('Could not place bid', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBidBusy(false);
    }
  }, [
    accessToken,
    bidBusy,
    onRequireAuth,
    openFullLiveRoom,
    refreshRoomSnapshot,
    roomSnap,
    stream.id,
  ]);

  const onSecondary = () => {
    if (secondaryDisabled) return;
    guard(() => {
      if (auctionLane) return;
      tabNav?.navigate('TradeCenter', { screen: 'TradeCenterHome' });
    });
  };
  const onPrimary = () => {
    if (primaryDisabled) return;
    guard(() => (auctionLane ? void tryPlaceLiveBid() : goInitiateTrade()));
  };
  const onSlide = () => {
    if (primaryDisabled) return;
    guard(() => (auctionLane ? void tryPlaceLiveBid() : goInitiateTrade()));
  };
  const onShop = () =>
    guard(() => {
      if (onOpenInlineShop) onOpenInlineShop();
      else tabNav?.navigate('Marketplace');
    });

  return (
    <View style={[styles.floatRoot, { paddingBottom: padBottom }]}>
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

      <View style={styles.hudInner}>
        <View style={styles.topBand}>
          <Text style={styles.timer}>{m.timerMmSs}</Text>
          <View style={styles.titleBlock}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {m.itemTitle}
            </Text>
            <Text style={styles.categoryType} numberOfLines={1}>
              {m.categoryType}
            </Text>
          </View>
          <View style={styles.priceBlock}>
            <Text style={styles.currentPrefix}>{m.currentPrefix}</Text>
            <Text style={styles.currentAmount}>{m.currentAmount}</Text>
          </View>
        </View>

        {metaLine ? (
          <Text style={styles.metaLine} numberOfLines={1}>
            {metaLine}
          </Text>
        ) : null}
        {auctionLane && signedIn ? (
          <Text style={styles.syncLine} numberOfLines={2}>
            {syncStatusLine ?? 'Syncing auction state from the vault…'}
          </Text>
        ) : null}

        <View style={styles.ctaBand}>
          <Pressable
            style={[styles.ctaGhost, secondaryDisabled && styles.ctaDisabled]}
            onPress={onSecondary}
            disabled={secondaryDisabled}
          >
            <Text
              style={[styles.ctaGhostText, secondaryDisabled && styles.ctaDisabledText]}
              numberOfLines={1}
            >
              {m.bottomLeftLabel}
            </Text>
          </Pressable>

          {m.showShopButton ? (
            <Pressable style={styles.ctaShop} onPress={onShop} accessibilityLabel={m.shopButtonLabel}>
              <Ionicons name="bag-handle-outline" size={20} color="rgba(255,255,255,0.88)" />
            </Pressable>
          ) : null}

          <View style={styles.ctaPrimaryWrap}>
            {bidBusy ? (
              <View style={[styles.ctaPrimary, styles.ctaPrimaryBusy]}>
                <ActivityIndicator color="#0a0a0a" />
              </View>
            ) : m.bottomRightIsSlide && !primaryDisabled ? (
              <CompactSlideToBid onCommit={onSlide} />
            ) : (
              <Pressable
                style={[styles.ctaGold, primaryDisabled && styles.ctaDisabled]}
                onPress={onPrimary}
                disabled={primaryDisabled}
              >
                <Text style={[styles.ctaGoldText, primaryDisabled && styles.ctaDisabledText]} numberOfLines={1}>
                  {m.bottomRightLabel}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
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
    minHeight: 36,
    justifyContent: 'center',
  },
  ctaPrimary: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.gold,
  },
  ctaPrimaryBusy: {
    opacity: 0.88,
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
  slideTrack: {
    flex: 1,
    height: 36,
    borderRadius: radii.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
  },
  slideHint: {
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.42)',
    pointerEvents: 'none',
  },
  slideKnob: {
    position: 'absolute',
    left: 2,
    top: 3,
    width: SLIDE_KNOB,
    height: SLIDE_KNOB,
    borderRadius: 7,
    backgroundColor: 'rgba(212,175,55,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  slideKnobChev: {
    color: colors.gold,
    fontSize: 16,
    fontWeight: '900',
    marginTop: -1,
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
