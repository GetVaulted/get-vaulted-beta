import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

export function TradeNegotiationPulse({
  items,
}: {
  items: readonly { id: string; text: string; time: string }[];
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Network activity</Text>
      {items.map((item, i) => (
        <View key={item.id} style={[styles.row, i < items.length - 1 && styles.rowBorder]}>
          <View style={styles.dot} />
          <Text style={styles.txt} numberOfLines={1}>
            {item.text}
          </Text>
          <Text style={styles.time}>{item.time}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  title: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gold,
  },
  txt: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  time: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
