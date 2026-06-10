import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchSellerPayoutTier, type SellerPayoutTierResponse } from '../../../api/payoutTierRepository';
import { colors, radii, spacing } from '../../../theme';

function formatUsd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function SellerPayoutTierCard({ accessToken }: { accessToken: string | undefined }) {
  const [data, setData] = useState<SellerPayoutTierResponse | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchSellerPayoutTier(accessToken)
      .then(setData)
      .catch(() => setData(null));
  }, [accessToken]);

  if (!data) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Seller program</Text>
      <Text style={styles.title}>{data.sellerLevelLabel}</Text>
      <Text style={styles.statusBadge}>{data.instantApprovalLabel}</Text>
      <Text style={styles.body}>{data.releaseDescription}</Text>
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLbl}>Lifetime GMV</Text>
          <Text style={styles.metricVal}>{formatUsd(data.metrics.lifetimeGmvUsd)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLbl}>Orders</Text>
          <Text style={styles.metricVal}>{data.metrics.completedOrders}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLbl}>Standing</Text>
          <Text style={styles.metricVal}>{data.metrics.accountStandingLabel}</Text>
        </View>
      </View>
      {data.nextTier ? (
        <>
          <Text style={styles.progressLbl}>Progress to {data.nextTier}</Text>
          {data.progressChecklist.slice(0, 5).map((item) => (
            <Text key={item.key} style={styles.checkItem}>
              {item.met ? '✓' : item.pending ? '◷' : '○'} {item.label}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: 'rgba(212,175,55,0.06)',
    padding: spacing.md,
    gap: spacing.xs,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  statusBadge: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.textMuted,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  body: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  metricsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  metric: { flex: 1 },
  metricLbl: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' },
  metricVal: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  progressLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  checkItem: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
});
