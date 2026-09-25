import { ScrollView, StyleSheet, View } from 'react-native';
import { ShimmerBone } from '../ui/ShimmerBone';
import { colors, radii, spacing } from '../../theme';
import { LIVE_ROOM_CARD_GAP, LIVE_ROOM_CARD_SNAP, LIVE_ROOM_CARD_WIDTH } from './LiveNowPreviewCard';

const IMAGE_ASPECT = 5 / 4;
const BODY_HEIGHT = 58;
/** Match LiveNowPreviewCard glow + card padding so skeleton cover height matches. */
const GLOW_INSET = 1.5 + 1;

function coverWidthForCard(cardWidth: number) {
  return Math.max(1, Math.round(cardWidth - GLOW_INSET * 2 - spacing.sm * 2));
}

function coverHeight(coverWidth: number) {
  return Math.round(coverWidth * IMAGE_ASPECT);
}

export const LIVE_ROOM_CARD_TOTAL_HEIGHT =
  24 + spacing.sm + coverHeight(coverWidthForCard(LIVE_ROOM_CARD_WIDTH)) + BODY_HEIGHT + spacing.sm * 2;

function LiveRoomCardSkeleton({
  index,
  width = LIVE_ROOM_CARD_WIDTH,
}: {
  index: number;
  width?: number;
}) {
  const imageHeight = coverHeight(coverWidthForCard(width));
  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.hostRow}>
        <ShimmerBone style={styles.avatar} index={index} borderRadius={11} />
        <ShimmerBone style={styles.hostLine} index={index + 1} borderRadius={4} />
      </View>
      <View style={[styles.cover, { height: imageHeight }]}>
        <ShimmerBone style={styles.coverFill} index={index} borderRadius={radii.md} />
      </View>
      <View style={styles.body}>
        <ShimmerBone style={styles.titleLine} index={index + 2} borderRadius={4} />
        <ShimmerBone style={styles.categoryLine} index={index + 3} borderRadius={4} />
      </View>
    </View>
  );
}

export function LiveRoomCardSkeletonRail({
  count = 5,
  layout = 'rail',
  gridWidth,
}: {
  count?: number;
  layout?: 'rail' | 'grid';
  gridWidth?: number;
}) {
  const width = layout === 'grid' && gridWidth ? gridWidth : LIVE_ROOM_CARD_WIDTH;

  if (layout === 'grid') {
    return (
      <View style={styles.grid}>
        {Array.from({ length: count }).map((_, i) => (
          <LiveRoomCardSkeleton key={i} index={i} width={width} />
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      snapToInterval={LIVE_ROOM_CARD_SNAP}
      snapToAlignment="start"
      decelerationRate="fast"
    >
      {Array.from({ length: count }).map((_, i) => (
        <LiveRoomCardSkeleton key={i} index={i} width={width} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: {
    paddingRight: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: LIVE_ROOM_CARD_GAP,
  },
  card: {
    marginRight: LIVE_ROOM_CARD_GAP,
    marginBottom: LIVE_ROOM_CARD_GAP,
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
    gap: spacing.sm,
  },
  avatar: { width: 22, height: 22 },
  hostLine: { flex: 1, height: 10 },
  cover: {
    width: '100%',
    overflow: 'hidden',
  },
  coverFill: {
    width: '100%',
    height: '100%',
  },
  body: {
    gap: 6,
    paddingHorizontal: 2,
  },
  titleLine: { height: 12, width: '92%' },
  categoryLine: { height: 8, width: '55%' },
});
