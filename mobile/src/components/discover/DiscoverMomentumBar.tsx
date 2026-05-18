import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchMarketplaceLiveStats } from '../../api/marketplaceStatsRepository';
import { colors, radii, spacing } from '../../theme';

export function MarketplaceMomentumBar() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof fetchMarketplaceLiveStats>> | null>(null);

  useEffect(() => {
    void fetchMarketplaceLiveStats().then(setStats);
  }, []);

  const active = stats?.activeListings;
  const items = [
    {
      icon: 'albums-outline' as const,
      value: active != null ? String(active) : '—',
      label: 'Active listings',
    },
    {
      icon: 'trending-up' as const,
      value: stats?.soldToday != null ? String(stats.soldToday) : '—',
      label: 'Sold today',
    },
    {
      icon: 'checkmark-done-outline' as const,
      value: stats?.completedSales != null ? String(stats.completedSales) : '—',
      label: 'Completed sales',
    },
  ];

  return (
    <View style={styles.wrap}>
      {items.map((item, i) => (
        <View key={item.label} style={[styles.cell, i < items.length - 1 && styles.border]}>
          <Ionicons name={item.icon} size={14} color={colors.gold} />
          <Text style={styles.value}>{item.value}</Text>
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: 'rgba(212,175,55,0.06)',
    overflow: 'hidden',
  },
  cell: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, gap: 2 },
  border: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: 'rgba(255,255,255,0.08)' },
  value: { fontSize: 15, fontWeight: '900', color: colors.textPrimary },
  label: { fontSize: 9, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
});
