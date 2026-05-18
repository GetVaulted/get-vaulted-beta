import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

type Pulse = { label: string; value: number; accent?: boolean };

export function TradePulseStrip({ items }: { items: Pulse[] }) {
  return (
    <View style={styles.row}>
      {items.map((item) => (
        <View key={item.label} style={[styles.cell, item.accent && styles.cellAccent]}>
          <Text style={[styles.val, item.accent && styles.valAccent]}>{item.value}</Text>
          <Text style={styles.lbl}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cell: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
  },
  cellAccent: {
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  val: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  valAccent: {
    color: colors.gold,
  },
  lbl: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
