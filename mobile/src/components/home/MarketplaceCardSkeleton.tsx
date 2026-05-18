import { ScrollView, StyleSheet, View } from 'react-native';
import { ShimmerBone } from '../ui/ShimmerBone';
import { colors, radii, spacing } from '../../theme';

export const MARKETPLACE_RAIL_CARD_WIDTH = 184;
export const MARKETPLACE_RAIL_CARD_HEIGHT = 292;
const CARD_GAP = spacing.sm;

function MarketplaceCardSkeleton({ index }: { index: number }) {
  return (
    <View style={styles.card}>
      <ShimmerBone style={styles.image} index={index} borderRadius={0} />
      <View style={styles.footer}>
        <ShimmerBone style={styles.price} index={index} borderRadius={4} />
        <ShimmerBone style={styles.title} index={index + 1} borderRadius={4} />
        <ShimmerBone style={styles.meta} index={index + 2} borderRadius={4} />
      </View>
    </View>
  );
}

export function MarketplaceCardSkeletonRail({ count = 4 }: { count?: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {Array.from({ length: count }).map((_, i) => (
        <MarketplaceCardSkeleton key={i} index={i} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    gap: CARD_GAP,
    paddingRight: spacing.lg,
  },
  card: {
    width: MARKETPLACE_RAIL_CARD_WIDTH,
    height: MARKETPLACE_RAIL_CARD_HEIGHT,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  image: {
    flex: 1,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    gap: 8,
  },
  price: { height: 14, width: 72 },
  title: { height: 12, width: '88%' },
  meta: { height: 10, width: '50%' },
});
