import { ScrollView, StyleSheet, View } from 'react-native';
import { BrowsePulledCard } from '../browse/BrowseVisualRows';
import { spacing } from '../../theme';
import type { SaleActivity } from '../../types';

export function HomeRecentSalesRail({ sales }: { sales: SaleActivity[] }) {
  if (!sales.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {sales.map((sale) => (
        <BrowsePulledCard key={sale.id} sale={sale} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { paddingRight: spacing.lg, gap: spacing.sm },
});
