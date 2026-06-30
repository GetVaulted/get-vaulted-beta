import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { fetchSellerPayoutTier, type SellerPayoutTierResponse } from '../../../api/payoutTierRepository';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';
import { StudioSection } from './SellerStudioUI';

function formatUsd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function TierMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLbl}>{label}</Text>
      <Text style={styles.metricVal} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export function SellerPayoutTierCard({ accessToken }: { accessToken: string | undefined }) {
  const [data, setData] = useState<SellerPayoutTierResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    void fetchSellerPayoutTier(accessToken)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [accessToken]);

  if (loading && !data) {
    return (
      <View style={[styles.loadingShell, hq.goldCard]}>
        <ActivityIndicator color={colors.gold} />
        <Text style={styles.loadingTxt}>Loading seller program…</Text>
      </View>
    );
  }

  if (!data) return null;

  const metCount = data.progressChecklist.filter((i) => i.met).length;
  const totalCount = data.progressChecklist.length;
  const progressPct = totalCount > 0 ? Math.round((metCount / totalCount) * 100) : 0;

  return (
    <StudioSection
      title="Seller program"
      subtitle={`${data.sellerLevelLabel} · ${data.instantApprovalLabel}`}
    >
      <View style={[styles.hero, hq.goldCard]}>
        <LinearGradient
          colors={['rgba(212,175,55,0.12)', 'rgba(8,8,10,0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroTop}>
          <Ionicons name="diamond-outline" size={18} color={colors.gold} />
          <Text style={styles.level}>{data.sellerLevelLabel}</Text>
        </View>
        <Text style={styles.release}>{data.releaseDescription}</Text>
        <View style={styles.metricsRow}>
          <TierMetric label="Lifetime GMV" value={formatUsd(data.metrics.lifetimeGmvUsd)} />
          <TierMetric label="Orders" value={String(data.metrics.completedOrders)} />
          <TierMetric label="Standing" value={data.metrics.accountStandingLabel} />
        </View>
      </View>

      {data.nextTier ? (
        <View style={styles.progressBlock}>
          <View style={styles.progressHead}>
            <Text style={styles.progressLbl}>Progress to {data.nextTier}</Text>
            <Text style={styles.progressPct}>{progressPct}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          {data.progressChecklist.slice(0, 5).map((item) => (
            <View key={item.key} style={styles.checkRow}>
              <Ionicons
                name={item.met ? 'checkmark-circle' : item.pending ? 'time-outline' : 'ellipse-outline'}
                size={16}
                color={item.met ? colors.success : item.pending ? '#FFB340' : colors.textMuted}
              />
              <Text style={[styles.checkItem, item.met && styles.checkItemMet]}>{item.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </StudioSection>
  );
}

const styles = StyleSheet.create({
  loadingShell: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingTxt: { color: colors.textMuted, fontSize: 13 },
  hero: {
    padding: spacing.md,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  level: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  release: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  metricsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  metric: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  metricLbl: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', fontWeight: '700' },
  metricVal: { fontSize: 14, fontWeight: '800', color: colors.textPrimary, marginTop: 4 },
  progressBlock: { gap: spacing.sm },
  progressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLbl: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  progressPct: { color: colors.gold, fontWeight: '800', fontSize: 13 },
  progressTrack: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkItem: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  checkItemMet: { color: colors.textPrimary },
});
