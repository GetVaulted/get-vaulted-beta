import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { UserAvatar } from '../ui/UserAvatar';
import { VaultImage } from '../ui/VaultImage';
import { liveRoomCardStatusLine, liveRoomCategoryLine } from '../../lib/liveRoomDisplay';
import { colors, radii, spacing } from '../../theme';
import type { LiveStream } from '../../types';
import { LiveBadge } from '../ui/LiveBadge';

/** Uniform live rail tile — use for snap intervals on horizontal lists. */
export const LIVE_ROOM_CARD_WIDTH = 168;
export const LIVE_ROOM_CARD_GAP = spacing.sm;
export const LIVE_ROOM_CARD_SNAP = LIVE_ROOM_CARD_WIDTH + LIVE_ROOM_CARD_GAP;

const COVER_HEIGHT = 168;

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export type LivePromoBadge = 'FEATURED' | 'TRENDING' | 'PROMOTED';

type Props = {
  stream: LiveStream;
  onPress: () => void;
  /** Placement priority badge — same card size always. */
  promoBadge?: LivePromoBadge;
  /** Grid layout uses full cell width; rail uses fixed width. */
  layout?: 'rail' | 'grid';
  gridWidth?: number;
};

export function LiveNowPreviewCard({
  stream,
  onPress,
  promoBadge,
  layout = 'rail',
  gridWidth,
}: Props) {
  const glow = useRef(new Animated.Value(0.35)).current;
  const category = liveRoomCategoryLine(stream);
  const status = liveRoomCardStatusLine(stream);
  const promoted = Boolean(promoBadge);
  const cardWidth = layout === 'grid' && gridWidth ? gridWidth : LIVE_ROOM_CARD_WIDTH;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0.35, duration: 900, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  const borderColor = glow.interpolate({
    inputRange: [0.35, 1],
    outputRange: promoted
      ? ['rgba(212,175,55,0.35)', 'rgba(212,175,55,0.75)']
      : ['rgba(255, 59, 48, 0.28)', 'rgba(255, 59, 48, 0.72)'],
  });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        { width: cardWidth },
        layout === 'grid' && styles.pressableGrid,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${stream.title}, ${category}, ${status}, ${formatViewers(stream.viewers)} watching`}
    >
      <Animated.View style={[styles.glowRing, { borderColor }]}>
        <View style={styles.card}>
          <View style={styles.cover}>
            <VaultImage
              uri={stream.previewImageUrl}
              width={cardWidth}
              height={COVER_HEIGHT}
              priority="high"
              contentFit="cover"
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.82)']}
              locations={[0, 0.55, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.coverTop}>
              <View style={styles.badgeCol}>
                <LiveBadge compact pulse />
                {promoBadge ? (
                  <View style={styles.promoPill}>
                    <Text style={styles.promoTxt}>{promoBadge}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.viewerPill}>
                <Ionicons name="eye" size={11} color={colors.textSecondary} />
                <Text style={styles.viewerTxt}>{formatViewers(stream.viewers)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.body}>
            <View style={styles.hostRow}>
              <UserAvatar
                uri={stream.host.avatarUrl}
                name={stream.host.name}
                username={stream.host.handle}
                size={28}
                tone="light"
              />
              <Text style={styles.title} numberOfLines={2}>
                {stream.title}
              </Text>
            </View>
            <Text style={styles.category} numberOfLines={1}>
              {category}
            </Text>
            <Text style={styles.status} numberOfLines={1}>
              {status}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: LIVE_ROOM_CARD_WIDTH,
    marginRight: LIVE_ROOM_CARD_GAP,
  },
  pressableGrid: {
    marginRight: 0,
    marginBottom: LIVE_ROOM_CARD_GAP,
  },
  pressed: { opacity: 0.94 },
  badgeCol: {
    gap: 4,
    alignItems: 'flex-start',
  },
  promoPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.85)',
  },
  promoTxt: {
    fontSize: 8,
    fontWeight: '900',
    color: '#0a0a0a',
    letterSpacing: 0.5,
  },
  glowRing: {
    borderRadius: radii.lg + 1,
    borderWidth: 1.5,
    padding: 1,
  },
  card: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cover: {
    height: COVER_HEIGHT,
    overflow: 'hidden',
  },
  coverTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.sm,
  },
  viewerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  viewerTxt: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: 4,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  category: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.4,
    marginLeft: 36,
  },
  status: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.live,
    marginLeft: 36,
  },
});
