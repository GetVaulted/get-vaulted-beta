import { ScrollView, StyleSheet, View } from 'react-native';
import { ShimmerBone } from '../ui/ShimmerBone';
import { colors, radii, spacing } from '../../theme';
import { LIVE_ROOM_CARD_GAP, LIVE_ROOM_CARD_SNAP, LIVE_ROOM_CARD_WIDTH } from './LiveNowPreviewCard';

const COVER_HEIGHT = 168;
const CARD_BODY_HEIGHT = 76;
export const LIVE_ROOM_CARD_TOTAL_HEIGHT = COVER_HEIGHT + CARD_BODY_HEIGHT;

function LiveRoomCardSkeleton({ index }: { index: number }) {
  return (
    <View style={styles.card}>
      <View style={styles.cover}>
        <ShimmerBone style={styles.coverFill} index={index} borderRadius={0} />
        <View style={styles.coverTop}>
          <ShimmerBone style={styles.livePill} index={index} borderRadius={radii.pill} />
          <ShimmerBone style={styles.viewerPill} index={index + 1} borderRadius={radii.pill} />
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.hostRow}>
          <ShimmerBone style={styles.avatar} index={index} borderRadius={14} />
          <ShimmerBone style={styles.titleLine} index={index + 1} borderRadius={4} />
        </View>
        <ShimmerBone style={styles.categoryLine} index={index + 2} borderRadius={4} />
        <ShimmerBone style={styles.statusLine} index={index + 3} borderRadius={4} />
      </View>
    </View>
  );
}

export function LiveRoomCardSkeletonRail({ count = 5 }: { count?: number }) {
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
        <LiveRoomCardSkeleton key={i} index={i} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: {
    paddingRight: spacing.lg,
  },
  card: {
    width: LIVE_ROOM_CARD_WIDTH,
    marginRight: LIVE_ROOM_CARD_GAP,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    height: LIVE_ROOM_CARD_TOTAL_HEIGHT,
  },
  cover: {
    height: COVER_HEIGHT,
    overflow: 'hidden',
  },
  coverFill: {
    ...StyleSheet.absoluteFillObject,
  },
  coverTop: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  livePill: { width: 44, height: 18 },
  viewerPill: { width: 36, height: 18 },
  body: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: 6,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: { width: 28, height: 28 },
  titleLine: { flex: 1, height: 28 },
  categoryLine: { height: 8, width: '55%', marginLeft: 36 },
  statusLine: { height: 8, width: '40%', marginLeft: 36 },
});
