import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { LIVE_AUCTION_HOST_TIMER_ENDED_COPY, resolveLiveAuctionLotBidPhase } from '../../../lib/liveAuctionLotPhase';
import { resolveLiveItemOverlayPrice } from '../../../lib/liveAuctionOverlayPrice';
import { colors, radii, spacing } from '../../../theme';
import { lc } from './liveConsoleTheme';

const DEFAULT_AUCTION_SEC = 15;

type HostLotHudPhase =
  | 'empty'
  | 'sold'
  | 'skipped'
  | 'prelive'
  | 'ready'
  | 'running'
  | 'ended';

function resolveHostLotHudPhase(args: {
  item: LiveRoomItemRow | null;
  roomLive: boolean;
  lotBidPhase: ReturnType<typeof resolveLiveAuctionLotBidPhase>;
  queuePreview?: boolean;
}): HostLotHudPhase {
  const { item, roomLive, lotBidPhase, queuePreview } = args;
  if (!item) return 'empty';
  if (queuePreview && item.status === 'queued') {
    return roomLive ? 'ready' : 'prelive';
  }
  if (item.status === 'sold') return 'sold';
  if (item.status === 'skipped') return 'skipped';
  if (!roomLive) return 'prelive';
  if (lotBidPhase === 'bidding_open') return 'running';
  if (lotBidPhase === 'timer_ended_unsettled') return 'ended';
  if (item.status === 'active' && lotBidPhase === 'not_started') return 'ready';
  return 'prelive';
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function countdownParts(endsAt: string | null, serverNowMs: number): { label: string; progress: number } | null {
  if (!endsAt) return null;
  const end = Date.parse(endsAt);
  if (Number.isNaN(end)) return null;
  const diff = end - serverNowMs;
  if (diff <= 0) return { label: 'Ended', progress: 0 };
  const s = Math.ceil(diff / 1000);
  const total = DEFAULT_AUCTION_SEC;
  const progress = Math.min(1, s / total);
  if (s >= 60) return { label: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, progress };
  return { label: `${s}s`, progress };
}

export function VaultPinnedLotCard({
  item,
  serverNowMs,
  roomLive,
  busy,
  startingAuction = false,
  density = 'default',
  onStartBidding,
  onSold,
  onSkip,
  onExtend,
  onPinNext,
  pinNextLabel,
  hostOverlayMinimal = false,
  queuePreview = false,
}: {
  item: LiveRoomItemRow | null;
  serverNowMs: number;
  roomLive: boolean;
  busy: boolean;
  startingAuction?: boolean;
  /** Compact broadcast overlay — ~18% smaller with live energy FX. */
  density?: 'default' | 'broadcast';
  onStartBidding: () => void;
  onSold: () => void;
  onSkip: () => void;
  onExtend: () => void;
  /** Pin the next queued lot when no item is active on the block. */
  onPinNext?: () => void;
  pinNextLabel?: string;
  /** Seller broadcast overlay — one action row (Start auction only). */
  hostOverlayMinimal?: boolean;
  /** Show the next queued lot before it is pinned. */
  queuePreview?: boolean;
}) {
  const compact = density === 'broadcast';

  const pulse = useRef(new Animated.Value(0.3)).current;
  const priceScale = useRef(new Animated.Value(1)).current;
  const borderPulse = useRef(new Animated.Value(0)).current;
  const gradientDrift = useRef(new Animated.Value(0)).current;
  const bidderFlash = useRef(new Animated.Value(0)).current;
  const countdownGlow = useRef(new Animated.Value(0)).current;
  const [, setTick] = useState(0);
  const prevBid = useRef<number | null>(null);
  const prevBidder = useRef<string | null>(null);

  useEffect(() => {
    if (!item?.auctionEndsAt || item.status !== 'active') return;
    const id = setInterval(() => setTick((t) => t + 1), 400);
    return () => clearInterval(id);
  }, [item?.auctionEndsAt, item?.status]);

  useEffect(() => {
    if (!item?.biddingOpen) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.2, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [item?.biddingOpen, pulse]);

  useEffect(() => {
    if (!item?.biddingOpen) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(borderPulse, { toValue: 1, duration: 800, useNativeDriver: false }),
        Animated.timing(borderPulse, { toValue: 0, duration: 800, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [borderPulse, item?.biddingOpen]);

  useEffect(() => {
    const drift = Animated.loop(
      Animated.timing(gradientDrift, { toValue: 1, duration: 5000, useNativeDriver: true }),
    );
    drift.start();
    return () => drift.stop();
  }, [gradientDrift]);

  useEffect(() => {
    const bid = item?.currentBidUsd ?? null;
    if (bid != null && prevBid.current != null && bid !== prevBid.current) {
      Animated.sequence([
        Animated.timing(priceScale, { toValue: 1.14, duration: 90, useNativeDriver: true }),
        Animated.spring(priceScale, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
    prevBid.current = bid;
  }, [item?.currentBidUsd, priceScale]);

  useEffect(() => {
    const bidder = item?.lastHighBidderUsername ?? null;
    if (bidder && prevBidder.current && bidder !== prevBidder.current) {
      bidderFlash.setValue(0);
      Animated.sequence([
        Animated.timing(bidderFlash, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(bidderFlash, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }
    prevBidder.current = bidder;
  }, [bidderFlash, item?.lastHighBidderUsername]);

  const lotBidPhase = useMemo(
    () =>
      item
        ? resolveLiveAuctionLotBidPhase(
            {
              status: item.status,
              biddingOpen: item.biddingOpen,
              auctionEndsAt: item.auctionEndsAt,
            },
            serverNowMs,
          )
        : 'inactive',
    [item, serverNowMs],
  );

  const countdown = useMemo(() => {
    if (!item?.auctionEndsAt) return null;
    if (item.biddingOpen) return countdownParts(item.auctionEndsAt, serverNowMs);
    if (lotBidPhase === 'timer_ended_unsettled') return { label: 'Ended', progress: 0 };
    return null;
  }, [item?.auctionEndsAt, item?.biddingOpen, lotBidPhase, serverNowMs]);

  useEffect(() => {
    if (!countdown || countdown.progress > 0.28) {
      countdownGlow.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(countdownGlow, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(countdownGlow, { toValue: 0.2, duration: 350, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [countdown, countdownGlow]);

  const driftX = gradientDrift.interpolate({ inputRange: [0, 1], outputRange: [-24, 24] });
  const borderColor = borderPulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(212,175,55,0.35)', 'rgba(255,59,48,0.55)'],
  });

  if (!item) {
    if (compact) {
      return (
        <View style={[styles.empty, styles.emptyCompact, onPinNext ? styles.emptyCompactAction : null]}>
          <Text style={styles.emptyInline} numberOfLines={1}>
            {onPinNext
              ? roomLive
                ? 'Pin next lot to put it on the block'
                : 'Go live, then pin the next lot'
              : 'No lots queued · tap + Add item'}
          </Text>
          {onPinNext ? (
            <Pressable
              style={[styles.pinBtn, (!roomLive || busy) && styles.pinBtnDisabled]}
              onPress={onPinNext}
              disabled={!roomLive || busy}
              accessibilityRole="button"
              accessibilityLabel="Pin lot"
            >
              <Text style={styles.pinBtnTxt}>{pinNextLabel ?? 'Pin lot'}</Text>
            </Pressable>
          ) : null}
        </View>
      );
    }
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No active item</Text>
        <Text style={styles.emptySub}>Add or queue a lot from Queue below</Text>
        {onPinNext ? (
          <Pressable
            style={[styles.pinBtn, styles.pinBtnDefault, (!roomLive || busy) && styles.pinBtnDisabled]}
            onPress={onPinNext}
            disabled={!roomLive || busy}
            accessibilityRole="button"
            accessibilityLabel="Pin lot"
          >
            <Text style={styles.pinBtnTxt}>{pinNextLabel ?? 'Pin lot'}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const thumb = item.imageUrl?.trim();
  const overlayPrice = resolveLiveItemOverlayPrice({
    commerceMode: 'auction',
    status: item.status,
    currentBidUsd: item.currentBidUsd,
    startingBidUsd: item.startingBidUsd,
    priceUsd: item.priceUsd,
    lastHighBidderUsername: item.lastHighBidderUsername,
  });
  const reserve =
    item.priceUsd != null && item.currentBidUsd != null && item.currentBidUsd >= item.priceUsd;
  const closingSoon = countdown != null && countdown.progress <= 0.28;
  const hudPhase = resolveHostLotHudPhase({ item, roomLive, lotBidPhase, queuePreview });
  const showStartAuction = hudPhase === 'ready';
  const showRunningStrip = !hostOverlayMinimal && hudPhase === 'running';
  const showEndedActions = hudPhase === 'ended';
  const showSecondaryActions =
    !hostOverlayMinimal && roomLive && hudPhase !== 'sold' && hudPhase !== 'skipped';

  return (
    <Animated.View
      style={[styles.shell, compact && styles.shellCompact, item.biddingOpen ? { borderColor } : undefined]}
    >
      <Animated.View style={[styles.gradientDrift, { transform: [{ translateX: driftX }] }]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(212,175,55,0.22)', 'rgba(255,59,48,0.08)', 'rgba(12,11,9,0.98)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[styles.bidGlow, { opacity: pulse }]} pointerEvents="none" />
      {closingSoon ? (
        <Animated.View style={[styles.countdownWash, { opacity: countdownGlow }]} pointerEvents="none" />
      ) : null}
      <Animated.View style={[styles.bidderFlash, { opacity: bidderFlash }]} pointerEvents="none" />
      <View style={[styles.row, compact && styles.rowCompact]}>
        <View style={styles.thumbWrap}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={[styles.thumb, compact && styles.thumbCompact]} />
          ) : (
            <View style={[styles.thumb, styles.thumbPh, compact && styles.thumbCompact]}>
              <Ionicons name="diamond-outline" size={compact ? 20 : 26} color={colors.gold} />
            </View>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.headRow}>
            <Text style={[lc.eyebrow, compact && styles.eyebrowCompact]}>
              {queuePreview ? 'Next up' : 'On screen'}
            </Text>
            {countdown ? (
              <View style={[styles.timerChip, closingSoon && styles.timerChipUrgent]}>
                <Text style={[styles.timerChipTxt, closingSoon && styles.timerChipTxtUrgent]}>
                  {countdown.label}
                </Text>
              </View>
            ) : null}
          </View>
          {countdown ? (
            <View style={styles.timerTrack}>
              <View
                style={[
                  styles.timerFill,
                  closingSoon && styles.timerFillUrgent,
                  { width: `${Math.round(countdown.progress * 100)}%` },
                ]}
              />
            </View>
          ) : null}
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={2}>
            {item.displayTitle ?? item.title}
          </Text>
          <Text style={[lc.eyebrow, compact && styles.eyebrowCompact]}>{overlayPrice.label}</Text>
          <Animated.Text style={[styles.bidVal, compact && styles.bidValCompact, { transform: [{ scale: priceScale }] }]}>
            {overlayPrice.amountFormatted}
          </Animated.Text>
          {item.lastHighBidderUsername ? (
            <View style={styles.bidderRow}>
              <Animated.View style={[styles.bidderDot, { opacity: pulse }]} />
              <Text style={[styles.leader, compact && styles.leaderCompact]} numberOfLines={1}>
                @{item.lastHighBidderUsername}
              </Text>
            </View>
          ) : (
            <Text style={[styles.meta, compact && styles.metaCompact]}>Waiting for first bid</Text>
          )}
          {hudPhase === 'ended' ? (
            <Text style={styles.hostEndedCopy}>{LIVE_AUCTION_HOST_TIMER_ENDED_COPY}</Text>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={[styles.meta, compact && styles.metaCompact]}>
              {showRunningStrip
                ? 'Auction running'
                : hudPhase === 'ended'
                  ? 'Awaiting mark sold'
                  : hudPhase === 'sold'
                    ? 'Sold'
                    : hudPhase === 'skipped'
                      ? 'Skipped'
                      : hudPhase === 'ready'
                        ? 'Ready to start'
                        : 'Ready'}
            </Text>
            {item.priceUsd != null ? (
              <Text style={[styles.meta, compact && styles.metaCompact, reserve && styles.metaOk]}>
                {reserve ? 'Reserve met' : 'Reserve'}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {showRunningStrip ? (
        <View style={[styles.runningStrip, compact && styles.runningStripCompact]}>
          <View style={styles.runningBadge}>
            <Animated.View style={[styles.bidderDot, { opacity: pulse }]} />
            <Text style={styles.runningBadgeTxt}>Auction Running</Text>
          </View>
          {countdown ? (
            <Text style={[styles.runningTimer, closingSoon && styles.runningTimerUrgent]}>{countdown.label}</Text>
          ) : null}
          <Text style={styles.runningBid}>{overlayPrice.amountFormatted}</Text>
        </View>
      ) : null}

      {hudPhase === 'sold' || hudPhase === 'skipped' ? (
        <View style={[styles.statusBanner, hudPhase === 'sold' ? styles.statusBannerSold : styles.statusBannerSkipped]}>
          <Text style={styles.statusBannerTxt}>{hudPhase === 'sold' ? 'Lot sold' : 'Lot skipped'}</Text>
        </View>
      ) : null}

      {showStartAuction ? (
        <Pressable
          style={[styles.startAuctionPrimary, compact && styles.startAuctionPrimaryCompact]}
          disabled={busy || startingAuction}
          onPress={onStartBidding}
          accessibilityRole="button"
          accessibilityLabel="Start auction"
        >
          {startingAuction ? (
            <ActivityIndicator color="#0a0a0a" size="small" />
          ) : (
            <Text style={[styles.startAuctionPrimaryTxt, compact && styles.startAuctionPrimaryTxtCompact]}>
              Start Auction
            </Text>
          )}
        </Pressable>
      ) : null}

      {showSecondaryActions ? (
        <View style={[styles.actions, compact && styles.actionsCompact]}>
          {showEndedActions ? (
            <Pressable
              style={[styles.actionGold, styles.actionFlex, compact && styles.actionCompact]}
              disabled={busy}
              onPress={onSold}
            >
              <Text style={[styles.actionGoldTxt, compact && styles.actionTxtCompact]}>Mark sold</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.action, compact && styles.actionCompact]} disabled={busy} onPress={onSold}>
              <Text style={[styles.actionTxt, compact && styles.actionTxtCompact]}>Sold</Text>
            </Pressable>
          )}
          <Pressable style={[styles.action, compact && styles.actionCompact]} disabled={busy} onPress={onSkip}>
            <Text style={[styles.actionTxt, compact && styles.actionTxtCompact]}>Skip</Text>
          </Pressable>
        </View>
      ) : hudPhase === 'prelive' ? (
        <Text style={[styles.hint, compact && styles.metaCompact]}>Go live to run this lot</Text>
      ) : null}
    </Animated.View>
  );
}

export { DEFAULT_AUCTION_SEC };

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    padding: spacing.sm,
    gap: 6,
  },
  shellCompact: {
    padding: 8,
    gap: 4,
    borderRadius: 14,
  },
  gradientDrift: {
    ...StyleSheet.absoluteFillObject,
    width: '140%',
    left: '-20%',
  },
  bidGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,59,48,0.05)',
  },
  countdownWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,59,48,0.12)',
  },
  bidderFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(212,175,55,0.2)',
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowCompact: { gap: 8 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 80, height: 96, borderRadius: radii.md, backgroundColor: 'rgba(0,0,0,0.4)' },
  thumbCompact: { width: 66, height: 78, borderRadius: 12 },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timerChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.45)',
  },
  timerChipUrgent: {
    backgroundColor: 'rgba(255,59,48,0.18)',
    borderColor: 'rgba(255,59,48,0.55)',
  },
  timerChipTxt: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.gold,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
  },
  timerChipTxtUrgent: { color: colors.live },
  timerTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 4,
    marginBottom: 2,
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.gold,
  },
  timerFillUrgent: { backgroundColor: colors.live },
  eyebrowCompact: { fontSize: 9 },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  titleCompact: { fontSize: 13, lineHeight: 16 },
  bidVal: { fontSize: 24, fontWeight: '900', color: colors.gold, marginTop: 1 },
  bidValCompact: { fontSize: 20, marginTop: 0 },
  bidderRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  bidderDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.live },
  leader: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, flex: 1 },
  leaderCompact: { fontSize: 10 },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  meta: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
  metaCompact: { fontSize: 9 },
  metaOk: { color: colors.success },
  hostEndedCopy: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fbbf24',
    marginTop: 4,
    lineHeight: 14,
  },
  runningStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(16,185,129,0.35)',
  },
  runningStripCompact: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    gap: 6,
  },
  runningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  runningBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6ee7b7',
    letterSpacing: 0.3,
  },
  runningTimer: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
  runningTimerUrgent: {
    color: colors.live,
  },
  runningBid: {
    marginLeft: 'auto',
    fontSize: 14,
    fontWeight: '900',
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
  statusBanner: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  statusBannerSold: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(16,185,129,0.35)',
  },
  statusBannerSkipped: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statusBannerTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  startAuctionPrimary: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.md,
  },
  startAuctionPrimaryCompact: {
    minHeight: 36,
  },
  startAuctionPrimaryTxt: {
    fontWeight: '900',
    fontSize: 13,
    color: '#0a0a0a',
    letterSpacing: 0.2,
  },
  startAuctionPrimaryTxtCompact: {
    fontSize: 12,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actionsCompact: { gap: 5, marginTop: 2 },
  actionFlex: { flex: 1 },
  actionGold: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  action: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  actionCompact: {
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  actionGoldTxt: { fontWeight: '800', color: '#0a0a0a', fontSize: 11 },
  actionTxt: { fontWeight: '700', color: colors.textPrimary, fontSize: 11 },
  actionTxtCompact: { fontSize: 10 },
  hint: { fontSize: 11, color: colors.textMuted },
  empty: {
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyCompact: { paddingVertical: 8, paddingHorizontal: spacing.sm },
  emptyCompactAction: { gap: 6, paddingVertical: 6 },
  emptyInline: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  emptySub: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  pinBtn: {
    alignSelf: 'stretch',
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(212,175,55,0.22)',
    alignItems: 'center',
  },
  pinBtnDefault: { marginTop: spacing.sm },
  pinBtnDisabled: { opacity: 0.45 },
  pinBtnTxt: { fontSize: 11, fontWeight: '900', color: colors.gold, textTransform: 'uppercase', letterSpacing: 0.6 },
});
