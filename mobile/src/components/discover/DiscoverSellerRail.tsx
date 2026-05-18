import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrowseCuratorCard } from '../browse/BrowseVisualRows';
import { colors, spacing } from '../../theme';
import type { FeaturedCreator } from '../../types';

export function DiscoverSellerRail({
  sellers,
  onSeeLive,
}: {
  sellers: FeaturedCreator[];
  onSeeLive?: (hostId: string) => void;
}) {
  if (!sellers.length) return null;

  return (
    <View style={styles.block}>
      <Text style={styles.title}>Featured sellers</Text>
      <Text style={styles.sub}>Top sellers · trusted vault lanes</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {sellers.map((c) => (
          <BrowseCuratorCard
            key={c.host.id}
            creator={c}
            onSeeLive={c.status === 'live' && onSeeLive ? () => onSeeLive(c.host.id) : undefined}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.lg },
  title: { fontSize: 17, fontWeight: '900', color: colors.textPrimary },
  sub: { fontSize: 11, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
  rail: { paddingRight: spacing.lg },
});
