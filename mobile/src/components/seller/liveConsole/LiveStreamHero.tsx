import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { HostStreamPayload } from '../../../api/liveHostRepository';
import type { LiveRoomHostDetail } from '../../../api/liveHostRepository';
import { colors, radii, spacing } from '../../../theme';
import { lc } from './liveConsoleTheme';
import { AnimatedMetricPill } from './AnimatedMetricPill';
import { BroadcastStatusPill } from './BroadcastStatusPill';
import { resolveBroadcastStatus } from './broadcastStatus';
import { HeroAmbientLayer } from './HeroAmbientLayer';

function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function LiveStreamHero({
  room,
  stream,
  viewerCount,
  revenueUsd,
  activeBidders,
  roomLive,
  thumbnailUrl,
  streamChecking,
  biddingUrgent,
  onBack,
  onGoLive,
  onEndShow,
  canStart,
  canEnd,
  busy,
}: {
  room: LiveRoomHostDetail | null;
  stream: HostStreamPayload | null;
  viewerCount: number;
  revenueUsd: number;
  activeBidders: number;
  roomLive: boolean;
  thumbnailUrl?: string | null;
  streamChecking?: boolean;
  biddingUrgent?: boolean;
  onBack: () => void;
  onGoLive: () => void;
  onEndShow: () => void;
  canStart: boolean;
  canEnd: boolean;
  busy: boolean;
}) {
  const { height } = useWindowDimensions();
  const heroH = Math.max(300, Math.min(height * 0.52, 440));
  const pulse = useRef(new Animated.Value(0.4)).current;
  const kenBurns = useRef(new Animated.Value(0)).current;
  const preview = thumbnailUrl?.trim();
  const broadcast = resolveBroadcastStatus({
    streamHealth: stream?.streamHealth,
    checking: streamChecking,
    lastIvsError: stream?.lastIvsError,
  });

  useEffect(() => {
    const kenLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(kenBurns, { toValue: 1, duration: 12000, useNativeDriver: true }),
        Animated.timing(kenBurns, { toValue: 0, duration: 12000, useNativeDriver: true }),
      ]),
    );
    kenLoop.start();
    return () => kenLoop.stop();
  }, [kenBurns]);

  useEffect(() => {
    if (!roomLive && !biddingUrgent) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, roomLive, biddingUrgent]);

  const imgScale = kenBurns.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.1] });

  return (
    <View style={[styles.hero, { height: heroH }]}>
      {preview ? (
        <Animated.Image
          source={{ uri: preview }}
          style={[StyleSheet.absoluteFill, { transform: [{ scale: imgScale }] }]}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient colors={['#1a1608', '#0a0a0c', '#050505']} style={StyleSheet.absoluteFill} />
      )}
      <HeroAmbientLayer roomLive={roomLive} biddingUrgent={biddingUrgent} />
      <LinearGradient
        colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.5)', 'rgba(8,8,10,0.96)']}
        style={StyleSheet.absoluteFill}
      />

      {(roomLive || biddingUrgent) && (
        <Animated.View style={[styles.livePulse, { opacity: pulse }]} pointerEvents="none" />
      )}

      {!preview && streamChecking ? (
        <View style={styles.shimmerWrap} pointerEvents="none">
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : null}

      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.glassBtn}>
          {Platform.OS === 'ios' ? <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} /> : null}
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.titleCol}>
          <Text style={lc.eyebrow}>Live command center</Text>
          <Text style={styles.roomTitle} numberOfLines={1}>
            {room?.title ?? 'Vault event'}
          </Text>
        </View>
        <View style={[styles.liveBadge, roomLive && styles.liveBadgeOn]}>
          {roomLive ? <Animated.View style={[styles.liveDot, { opacity: pulse }]} /> : null}
          <Text style={[styles.liveBadgeTxt, roomLive && styles.liveBadgeTxtOn]}>
            {roomLive ? 'On air' : room?.status === 'ended' ? 'Ended' : 'Standby'}
          </Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <AnimatedMetricPill icon="eye-outline" label="Viewers" value={viewerCount} />
        <AnimatedMetricPill icon="wallet-outline" label="Revenue" value={fmtUsd(revenueUsd)} />
        <AnimatedMetricPill
          icon="hammer-outline"
          label="Bidders"
          value={activeBidders > 0 ? activeBidders : '—'}
          glow={activeBidders > 0}
        />
      </View>

      <View style={styles.bottomOverlay}>
        <BroadcastStatusPill status={broadcast} />
        <View style={styles.ctaRow}>
          {canStart ? (
            <Pressable style={[styles.goLive, busy && styles.disabled]} disabled={busy} onPress={onGoLive}>
              <LinearGradient colors={['#F0D56A', colors.gold, '#9A7B2C']} style={StyleSheet.absoluteFill} />
              <Ionicons name="radio" size={20} color="#0a0a0a" />
              <Text style={styles.goLiveTxt}>Take the lane</Text>
            </Pressable>
          ) : null}
          {canEnd ? (
            <Pressable style={[styles.endBtn, busy && styles.disabled]} disabled={busy} onPress={onEndShow}>
              <Text style={styles.endBtnTxt}>End show</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', overflow: 'hidden', backgroundColor: '#050505' },
  livePulse: {
    position: 'absolute',
    top: '28%',
    left: '15%',
    right: '15%',
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,59,48,0.1)',
  },
  shimmerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  glassBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  titleCol: { flex: 1, minWidth: 0 },
  roomTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  liveBadgeOn: { borderColor: 'rgba(255,59,48,0.5)', backgroundColor: 'rgba(255,59,48,0.15)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  liveBadgeTxt: { fontSize: 11, fontWeight: '800', color: colors.textMuted },
  liveBadgeTxtOn: { color: colors.live },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    gap: spacing.sm,
  },
  ctaRow: { flexDirection: 'row', gap: spacing.sm },
  goLive: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radii.md,
    overflow: 'hidden',
    ...lc.goldGlow,
  },
  goLiveTxt: { fontSize: 15, fontWeight: '900', color: '#0a0a0a' },
  endBtn: {
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.45)',
    backgroundColor: 'rgba(255,59,48,0.12)',
  },
  endBtnTxt: { color: '#FF8A8A', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.55 },
});
