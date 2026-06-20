import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

type Props = {
  liveCount?: number;
  listingCount?: number;
  scheduledCount?: number;
};

function formatStat(n: number, fallback: string): string {
  if (n <= 0) return fallback;
  return String(n);
}

export function MomentumStrip({ liveCount = 0, listingCount = 0, scheduledCount = 0 }: Props) {
  const items = [
    {
      key: 'live',
      icon: 'radio' as const,
      value: formatStat(liveCount, '—'),
      sub: liveCount > 0 ? 'Live now' : 'Rooms open soon',
    },
    {
      key: 'vault',
      icon: 'diamond-outline' as const,
      value: formatStat(listingCount, '—'),
      sub: listingCount > 0 ? 'In the vault' : 'Listings incoming',
    },
    {
      key: 'drops',
      icon: 'calendar-outline' as const,
      value: formatStat(scheduledCount, '—'),
      sub: scheduledCount > 0 ? 'Upcoming drops' : 'Events scheduling',
    },
  ];

  return (
    <View style={styles.wrap}>
      {items.map((item, i) => (
        <View key={item.key} style={[styles.cell, i < items.length - 1 && styles.cellBorder]}>
          <Ionicons name={item.icon} size={14} color="rgba(212,175,55,0.85)" />
          <Text style={styles.value}>{item.value}</Text>
          <Text style={styles.sub}>{item.sub}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  cell: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: 2,
  },
  cellBorder: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255,255,255,0.06)',
  },
  value: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
  },
});
