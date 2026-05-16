import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';

const METRICS = [
  { key: 'revenueToday', label: 'Revenue today' },
  { key: 'sellThrough', label: 'Sell-through' },
  { key: 'activeViewers', label: 'Active viewers' },
  { key: 'conversion', label: 'Conversion' },
  { key: 'gmv', label: 'GMV' },
  { key: 'avgHammer', label: 'Avg auction close' },
] as const;

export function SellerHQAnalyticsPreview({
  values,
}: {
  values: Record<(typeof METRICS)[number]['key'], string>;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={hq.sectionEyebrow}>Performance pulse</Text>
      <Text style={hq.sectionTitle}>Live commerce analytics</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {METRICS.map((m) => (
          <View key={m.key} style={styles.card}>
            <Text style={styles.val}>{values[m.key] ?? '—'}</Text>
            <Text style={styles.lbl}>{m.label}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  rail: { gap: spacing.sm, paddingRight: spacing.md },
  card: {
    minWidth: 128,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  val: { fontSize: 20, fontWeight: '800', color: colors.gold },
  lbl: { fontSize: 11, color: colors.textMuted, marginTop: 6, fontWeight: '600' },
});
