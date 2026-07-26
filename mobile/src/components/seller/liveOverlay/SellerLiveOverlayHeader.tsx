import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { UserAvatar } from '../../ui/UserAvatar';
import { LiveBadge } from '../../ui/LiveBadge';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import type { HostVideoFeedKind, HostVideoFeedStatus } from '../../../lib/hostVideoFeedStatus';
import { formatLiveDurationHms } from '../../../lib/formatLiveDurationHms';
import { colors, spacing } from '../../../theme';

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function badgeVariantForFeed(
  kind: HostVideoFeedKind,
): 'live' | 'scheduled' | 'warning' | 'elsewhere' | 'offline' {
  switch (kind) {
    case 'live':
      return 'live';
    case 'elsewhere':
      return 'elsewhere';
    case 'connecting':
    case 'paused':
      return 'warning';
    case 'offline':
      return 'offline';
    case 'scheduled':
    default:
      return 'scheduled';
  }
}

export function SellerLiveOverlayHeader({
  paddingTop,
  hostName,
  hostAvatarUrl,
  streamTitle,
  viewerCount,
  /** @deprecated Prefer `videoFeed` — kept for callers that only know on/off. */
  streamOnAir = false,
  /** Buyer-facing video indicator (LIVE / Connecting / Paused / No video). */
  videoFeed = null,
  liveStartedAt = null,
  onBack,
  onBroadcastSettings,
  onEndShow,
  canEnd,
  endBusy,
  toolbar,
  toolbarMinHeight = 32,
}: {
  paddingTop: number;
  hostName: string;
  hostAvatarUrl: string | null;
  streamTitle: string;
  viewerCount: number;
  streamOnAir?: boolean;
  videoFeed?: HostVideoFeedStatus | null;
  /** Room `startedAt` — drives the on-air elapsed timer. */
  liveStartedAt?: string | null;
  onBack: () => void;
  onBroadcastSettings: () => void;
  onEndShow?: () => void;
  canEnd?: boolean;
  endBusy?: boolean;
  /** Compact seller tools row (Sales, Givvys, etc.) attached under the identity row. */
  toolbar?: ReactNode;
  toolbarMinHeight?: number;
}) {
  const ringPulse = useRef(new Animated.Value(0)).current;
  const viewerPop = useRef(new Animated.Value(1)).current;
  const prevViewers = useRef(viewerCount);

  const feed: HostVideoFeedStatus =
    videoFeed ??
    (streamOnAir
      ? { kind: 'live', label: 'LIVE', videoOnAir: true }
      : { kind: 'scheduled', label: SELLER_CONSOLE.scheduled, videoOnAir: false });

  const videoOnAir = feed.videoOnAir;
  const showPulseRing = feed.kind === 'live' || feed.kind === 'elsewhere';

  useEffect(() => {
    if (!showPulseRing) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(ringPulse, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ringPulse, showPulseRing]);

  useEffect(() => {
    if (viewerCount === prevViewers.current) return;
    prevViewers.current = viewerCount;
    Animated.sequence([
      Animated.timing(viewerPop, { toValue: 1.12, duration: 100, useNativeDriver: true }),
      Animated.spring(viewerPop, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
  }, [viewerCount, viewerPop]);

  const ringOpacity = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });
  const ringScale = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const [nowMs, setNowMs] = useState(Date.now());
  const timerActive = Boolean(liveStartedAt);

  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerActive, liveStartedAt]);

  const liveTimerDisplay =
    timerActive && liveStartedAt ? formatLiveDurationHms(liveStartedAt, nowMs) : null;

  const badgeVariant = badgeVariantForFeed(feed.kind);

  return (
    <View style={[styles.wrap, { paddingTop, paddingHorizontal: spacing.md }]}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Pressable onPress={onBack} hitSlop={12} style={styles.back} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.92)" />
          </Pressable>
          <View style={styles.identity}>
            <View style={styles.avatarWrap}>
              {showPulseRing ? (
                <Animated.View
                  style={[
                    styles.avatarRing,
                    feed.kind === 'elsewhere' && styles.avatarRingElsewhere,
                    { opacity: ringOpacity, transform: [{ scale: ringScale }] },
                  ]}
                />
              ) : null}
              <UserAvatar uri={hostAvatarUrl} name={hostName} size={32} borderColor="rgba(255,255,255,0.35)" />
            </View>
            <View style={styles.textCol}>
              <Text style={styles.hostName} numberOfLines={1}>
                {hostName}
              </Text>
              <Text style={styles.title} numberOfLines={1}>
                {streamTitle}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.right}>
          <View style={styles.liveCluster}>
            <LiveBadge compact pulse={feed.kind === 'live'} label={feed.label} variant={badgeVariant} />
            {liveTimerDisplay && (videoOnAir || feed.kind === 'paused' || feed.kind === 'connecting') ? (
              <Text style={styles.liveTimer}>{liveTimerDisplay}</Text>
            ) : null}
            <Animated.Text style={[styles.viewers, { transform: [{ scale: viewerPop }] }]}>
              {formatViewers(viewerCount)}
            </Animated.Text>
          </View>
          <Pressable style={styles.iconBtn} onPress={onBroadcastSettings} accessibilityLabel="Broadcast settings">
            <Ionicons name="settings-outline" size={19} color="rgba(255,255,255,0.88)" />
          </Pressable>
          {canEnd ? (
            <Pressable
              style={styles.endBtn}
              onPress={onEndShow}
              disabled={endBusy}
              accessibilityLabel="End show"
            >
              <Ionicons name="stop-circle-outline" size={18} color={colors.live} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {toolbar ? <View style={[styles.toolbarRow, { minHeight: toolbarMinHeight }]}>{toolbar}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 40,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
    gap: 2,
  },
  back: {
    marginRight: 2,
    marginLeft: -4,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    minWidth: 0,
  },
  avatarWrap: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: colors.gold,
  },
  avatarRingElsewhere: {
    borderColor: '#34d399',
  },
  textCol: { flex: 1, minWidth: 0 },
  hostName: {
    color: 'rgba(255,255,255,0.96)',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  title: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
  },
  liveCluster: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 2 },
  liveTimer: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  viewers: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  iconBtn: { padding: 8 },
  endBtn: { padding: 8 },
  toolbarRow: {
    marginTop: 4,
  },
});
