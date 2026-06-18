import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { UserAvatar } from '../ui/UserAvatar';
import { VaultImage } from '../ui/VaultImage';
import { liveRoomCardStatusLine, liveRoomCategoryLine } from '../../lib/liveRoomDisplay';
import { resolveLiveRoomPreviewImage } from '../../lib/liveRoomPreviewImage';
import { colors, radii, spacing } from '../../theme';
import type { LiveStream } from '../../types';
import { LiveBadge } from '../ui/LiveBadge';

/** Uniform live rail tile — use for snap intervals on horizontal lists. */
export const LIVE_ROOM_CARD_WIDTH = 168;
export const LIVE_ROOM_CARD_GAP = spacing.sm;
export const LIVE_ROOM_CARD_SNAP = LIVE_ROOM_CARD_WIDTH + LIVE_ROOM_CARD_GAP;

const IMAGE_ASPECT = 5 / 4;

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function coverHeight(cardWidth: number) {
  return Math.round(cardWidth * IMAGE_ASPECT);
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
  onRemind?: () => void;
};

export function LiveNowPreviewCard({
  stream,
  onPress,
  promoBadge,
  layout = 'rail',
  gridWidth,
  onRemind,
}: Props) {
  const glow = useRef(new Animated.Value(0.35)).current;
  const isLive = stream.roomStatus === 'live';
  const isScheduled = stream.roomStatus === 'scheduled';
  const category = liveRoomCategoryLine(stream);
  const status = liveRoomCardStatusLine(stream);
  const promoted = Boolean(promoBadge);
  const cardWidth = layout === 'grid' && gridWidth ? gridWidth : LIVE_ROOM_CARD_WIDTH;
  const imageHeight = coverHeight(cardWidth);
  const hostLabel = stream.host.name?.trim() || stream.host.handle.replace(/^@/, '');
  const coverUri =
    stream.previewImageUrl?.trim() ||
    (isScheduled ? stream.host.avatarUrl?.trim() : undefined) ||
    resolveLiveRoomPreviewImage({ category: stream.category });

  useEffect(() => {
    if (!isLive) {
      glow.setValue(0.35);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0.35, duration: 900, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow, isLive]);

  const borderColor = glow.interpolate({
    inputRange: [0.35, 1],
    outputRange: promoted
      ? ['rgba(212,175,55,0.35)', 'rgba(212,175,55,0.75)']
      : isLive
        ? ['rgba(255, 59, 48, 0.28)', 'rgba(255, 59, 48, 0.72)']
        : ['rgba(212,175,55,0.22)', 'rgba(212,175,55,0.45)'],
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
      accessibilityLabel={`${stream.title}, ${category}, ${status}${isLive ? `, ${formatViewers(stream.viewers)} watching` : ''}`}
    >
      <Animated.View style={[styles.glowRing, { borderColor }]}>
        <View style={styles.card}>
          <View style={styles.hostRow}>
            <UserAvatar
              uri={stream.host.avatarUrl}
              name={stream.host.name}
              username={stream.host.handle}
              size={22}
              tone="light"
            />
            <Text style={styles.hostName} numberOfLines={1}>
              {hostLabel}
            </Text>
            {stream.host.verified ? (
              <Ionicons name="checkmark-circle" size={13} color={colors.gold} />
            ) : null}
            {isScheduled && onRemind ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  onRemind();
                }}
                hitSlop={8}
                style={styles.remindBtn}
                accessibilityRole="button"
                accessibilityLabel="Remind me about this event"
              >
                <Ionicons name="notifications-outline" size={14} color={colors.gold} />
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.cover, { height: imageHeight }]}>
            <VaultImage
              uri={coverUri}
              width={cardWidth}
              height={imageHeight}
              priority="high"
              contentFit="cover"
              contentPosition="center"
              borderRadius={radii.md}
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.42)', 'rgba(0,0,0,0.08)', 'transparent']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.coverTop}>
              <View style={styles.badgeCol}>
                {isLive ? (
                  <LiveBadge compact pulse label="LIVE" variant="live" />
                ) : (
                  <LiveBadge compact label="SCHEDULED" variant="scheduled" />
                )}
                {promoBadge ? (
                  <View style={styles.promoPill}>
                    <Text style={styles.promoTxt}>{promoBadge}</Text>
                  </View>
                ) : null}
              </View>
              {isLive ? (
                <View style={styles.viewerPill}>
                  <Ionicons name="eye" size={11} color={colors.textSecondary} />
                  <Text style={styles.viewerTxt}>{formatViewers(stream.viewers)}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>
              {stream.title}
            </Text>
            <Text style={styles.category} numberOfLines={1}>
              {category}
            </Text>
            {isScheduled ? (
              <Text style={styles.status} numberOfLines={1}>
                {stream.showDescription?.trim() || status}
              </Text>
            ) : null}
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
  },
  pressed: { opacity: 0.94 },
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
    padding: spacing.sm,
    gap: spacing.sm,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 24,
  },
  hostName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.15,
  },
  remindBtn: {
    marginLeft: 'auto',
    padding: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.28)',
  },
  cover: {
    width: '100%',
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  coverTop: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.sm,
  },
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
    gap: 3,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  title: {
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
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  status: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gold,
  },
});
