import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { UserAvatar } from '../ui/UserAvatar';
import { VaultImage } from '../ui/VaultImage';
import { LiveBadge } from '../ui/LiveBadge';
import { liveRoomCategoryLine } from '../../lib/liveRoomDisplay';
import { resolveLiveRoomPreviewImage } from '../../lib/liveRoomPreviewImage';
import { colors, radii, spacing } from '../../theme';
import type { LiveStream } from '../../types';

const CARD_W = Dimensions.get('window').width - spacing.lg * 2;
const CARD_H = Math.round(Math.min(CARD_W * 0.92, 340));

function formatViewers(n: number) {
  if (n <= 0) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k watching`;
  return `${n} watching`;
}

function LivePulseDot() {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.pulseDot, { opacity: pulse }]}>
      <View style={styles.pulseCore} />
    </Animated.View>
  );
}

export function HomeFeaturedLiveCard({
  stream,
  onPress,
}: {
  stream: LiveStream;
  onPress: () => void;
}) {
  const preview =
    stream.previewImageUrl?.trim() ||
    stream.pinnedItemImageUrl?.trim() ||
    resolveLiveRoomPreviewImage({ category: stream.category });
  const itemPreview = stream.pinnedProductLabel?.trim() || stream.currentItem?.trim();
  const category = liveRoomCategoryLine(stream);
  const viewers = formatViewers(stream.viewers);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.shell, { width: CARD_W, height: CARD_H }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Watch live: ${stream.title}`}
    >
      <VaultImage uri={preview} width={CARD_W} height={CARD_H} priority="high" contentFit="cover" style={StyleSheet.absoluteFillObject} />
      <LinearGradient colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.95)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <View style={styles.liveRow}>
            <LivePulseDot />
            <LiveBadge compact />
          </View>
          {viewers ? <Text style={styles.viewers}>{viewers}</Text> : null}
        </View>
        <View style={styles.hostRow}>
          <UserAvatar uri={stream.host.avatarUrl} name={stream.host.name} username={stream.host.handle} size={36} tone="light" borderWidth={1} />
          <View style={{ flex: 1 }}>
            <Text style={styles.hostName} numberOfLines={1}>{stream.host.name}</Text>
            <Text style={styles.hostMeta} numberOfLines={1}>{category}</Text>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={2}>{stream.title}</Text>
        {itemPreview ? (
          <View style={styles.itemChip}>
            <Ionicons name="flash" size={12} color={colors.gold} />
            <Text style={styles.itemChipTxt} numberOfLines={1}>{itemPreview}</Text>
          </View>
        ) : null}
        <View style={styles.cta}>
          <Text style={styles.ctaTxt}>Watch Live</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </View>
      </View>
    </Pressable>
  );
}

export function HomeLiveHeroSkeleton() {
  return (
    <View style={[styles.skeleton, { width: CARD_W, height: CARD_H }]}>
      <LinearGradient colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.lg + 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,48,0.35)',
  },
  pressed: { opacity: 0.94 },
  skeleton: {
    borderRadius: radii.lg + 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  inner: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  topRow: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,59,48,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  viewers: { fontSize: 12, fontWeight: '800', color: '#fff' },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hostName: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  hostMeta: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  itemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  itemChipTxt: { flexShrink: 1, fontSize: 11, fontWeight: '700', color: colors.gold },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.xs,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.live,
  },
  ctaTxt: { fontSize: 14, fontWeight: '900', color: '#fff' },
});
