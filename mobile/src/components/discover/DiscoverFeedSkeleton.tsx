import { StyleSheet, View } from 'react-native';
import { ShimmerRail } from '../ui/ShimmerRail';
import { spacing } from '../../theme';

export function MarketplaceFeedSkeleton() {
  return (
    <View style={styles.wrap}>
      <View style={styles.hero} />
      <ShimmerRail count={3} height={208} />
      <View style={{ height: spacing.lg }} />
      <ShimmerRail count={3} height={208} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, marginTop: spacing.md },
  hero: {
    height: 132,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
});
