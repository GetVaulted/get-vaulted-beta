import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { SellerAnalyticsSnapshot } from '../../../api/sellerAnalyticsRepository';
import { colors, radii, spacing } from '../../../theme';

function formatUsdWhole(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function Sparkline({ values, tone }: { values: number[]; tone: 'gold' | 'muted' }) {
  const max = Math.max(1, ...values);
  return (
    <View style={styles.spark}>
      {values.map((v, i) => {
        const isLast = i === values.length - 1;
        const heightPct = Math.max(10, Math.round((v / max) * 100));
        return (
          <View
            key={i}
            style={[
              styles.sparkBar,
              { height: `${heightPct}%` },
              isLast && tone === 'gold' ? styles.sparkBarOn : null,
            ]}
          />
        );
      })}
    </View>
  );
}

function shipAgeHint(hours: number | null): string {
  if (hours == null) return 'All caught up';
  if (hours < 1) return 'Oldest: just now';
  if (hours < 24) return `Oldest: ${hours} hr${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `Oldest: ${days} day${days === 1 ? '' : 's'}`;
}

export function SellerHQPerformanceKpiRow({ analytics }: { analytics: SellerAnalyticsSnapshot }) {
  const hasTrend = analytics.avgSaleWeeklyTrend.some((v) => v > 0);
  const toShip = analytics.pendingFulfillment;

  return (
    <View style={styles.row}>
      <View style={styles.tile}>
        <View style={styles.head}>
          <Ionicons name="flash-outline" size={12} color={colors.textMuted} />
          <Text style={styles.lbl}>Sell-through</Text>
        </View>
        <Text style={[styles.val, styles.valAccent]}>
          {analytics.sellThroughPercent != null ? `${analytics.sellThroughPercent}%` : '—'}
        </Text>
        <Text style={styles.hint}>
          {analytics.completedSales} sold · {analytics.activeListings} active
        </Text>
      </View>

      <View style={styles.tile}>
        <View style={styles.head}>
          <Ionicons name="pricetag-outline" size={12} color={colors.textMuted} />
          <Text style={styles.lbl}>Avg. sale</Text>
        </View>
        <Text style={styles.val}>{analytics.avgSaleCents != null ? formatUsdWhole(analytics.avgSaleCents) : '—'}</Text>
        {hasTrend ? (
          <Sparkline values={analytics.avgSaleWeeklyTrend} tone="gold" />
        ) : (
          <Text style={styles.hint}>5-week trend</Text>
        )}
      </View>

      <View style={styles.tile}>
        <View style={styles.head}>
          <Ionicons name="cube-outline" size={12} color={toShip > 0 ? colors.gold : colors.textMuted} />
          <Text style={[styles.lbl, toShip > 0 && styles.lblWarn]}>To ship</Text>
        </View>
        <Text style={[styles.val, toShip > 0 && styles.valWarn]}>{toShip}</Text>
        <Text style={styles.hint}>{shipAgeHint(analytics.oldestAwaitingShipHours)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: colors.surfaceElevated,
    padding: spacing.sm,
    paddingVertical: 10,
    gap: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lbl: { fontSize: 8.7, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textMuted },
  lblWarn: { color: '#FFB340' },
  val: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  valAccent: { color: colors.gold },
  valWarn: { color: '#FFB340' },
  hint: { fontSize: 9, color: colors.textMuted },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16 },
  sparkBar: { flex: 1, borderRadius: 2, backgroundColor: 'rgba(212,175,55,0.28)' },
  sparkBarOn: { backgroundColor: colors.gold },
});
