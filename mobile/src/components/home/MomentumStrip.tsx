import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';
import { momentumSnapshot } from '../../data/mockData';

export function MomentumStrip() {
  const items = [
    {
      key: 'sold',
      icon: 'trending-up' as const,
      value: momentumSnapshot.soldToday,
      sub: momentumSnapshot.soldTodaySub,
    },
    {
      key: 'watch',
      icon: 'radio' as const,
      value: momentumSnapshot.watching,
      sub: momentumSnapshot.watchingSub,
    },
    {
      key: 'end',
      icon: 'timer-outline' as const,
      value: momentumSnapshot.ending,
      sub: momentumSnapshot.endingSub,
    },
  ];

  return (
    <View style={styles.wrap}>
      {items.map((item, i) => (
        <View key={item.key} style={[styles.cell, i < items.length - 1 && styles.cellBorder]}>
          <Ionicons name={item.icon} size={16} color={colors.gold} />
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
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
    marginTop: spacing.lg,
  },
  cell: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  cellBorder: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  value: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sub: {
    ...typography.micro,
    fontSize: 9,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
