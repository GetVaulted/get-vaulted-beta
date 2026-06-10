import { StyleSheet, View } from 'react-native';
import { ShimmerRail } from '../ui/ShimmerRail';
import { spacing } from '../../theme';

export function MarketplaceFeedSkeleton({
  heroHeight = 132,
  cardHeight = 208,
  cardWidth = 152,
}: {
  heroHeight?: number;
  cardHeight?: number;
  cardWidth?: number;
}) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.hero, { height: heroHeight }]} />
      <ShimmerRail count={3} height={cardHeight} cardWidth={cardWidth} />
      <View style={{ height: spacing.lg }} />
      <ShimmerRail count={3} height={cardHeight} cardWidth={cardWidth} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, marginTop: spacing.md, maxWidth: '100%' },
  hero: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
});
