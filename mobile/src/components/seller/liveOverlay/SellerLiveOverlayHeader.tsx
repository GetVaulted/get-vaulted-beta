import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { UserAvatar } from '../../ui/UserAvatar';
import { LiveBadge } from '../../ui/LiveBadge';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { colors, spacing } from '../../../theme';

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function SellerLiveOverlayHeader({
  paddingTop,
  hostName,
  hostAvatarUrl,
  streamTitle,
  viewerCount,
  roomLive,
  onBack,
  onBroadcastSettings,
  onEndShow,
  canEnd,
  endBusy,
}: {
  paddingTop: number;
  hostName: string;
  hostAvatarUrl: string | null;
  streamTitle: string;
  viewerCount: number;
  roomLive: boolean;
  onBack: () => void;
  onBroadcastSettings: () => void;
  onEndShow?: () => void;
  canEnd?: boolean;
  endBusy?: boolean;
}) {
  const ringPulse = useRef(new Animated.Value(0)).current;
  const viewerPop = useRef(new Animated.Value(1)).current;
  const prevViewers = useRef(viewerCount);

  useEffect(() => {
    if (!roomLive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(ringPulse, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ringPulse, roomLive]);

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

  return (
    <View style={[styles.wrap, { paddingTop, paddingHorizontal: spacing.md }]}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Pressable onPress={onBack} hitSlop={12} style={styles.back} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.92)" />
          </Pressable>
          <View style={styles.identity}>
            <View style={styles.avatarWrap}>
              {roomLive ? (
                <Animated.View
                  style={[
                    styles.avatarRing,
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
          {roomLive ? (
            <View style={styles.liveCluster}>
              <LiveBadge compact pulse />
              <Animated.Text style={[styles.viewers, { transform: [{ scale: viewerPop }] }]}>
                {formatViewers(viewerCount)}
              </Animated.Text>
            </View>
          ) : (
            <Text style={styles.scheduled}>{SELLER_CONSOLE.scheduled}</Text>
          )}
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
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
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
  viewers: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  scheduled: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '700',
    marginRight: 4,
  },
  iconBtn: { padding: 8 },
  endBtn: { padding: 8 },
});
