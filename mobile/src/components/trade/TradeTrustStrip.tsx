import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';

const ROWS = [
  { icon: 'person-circle-outline' as const, text: 'Get Vaulted account required to trade' },
  { icon: 'shield-checkmark-outline' as const, text: 'Verified profiles & Vaulted Verified items' },
  {
    icon: 'ribbon-outline' as const,
    text: 'Flat Get Vaulted Trade Fee per shipment — includes label, tracking, trade protection, and dispute support',
  },
];

export function TradeTrustStrip() {
  return (
    <View style={styles.box}>
      {ROWS.map((r) => (
        <View key={r.text} style={styles.row}>
          <Ionicons name={r.icon} size={16} color={colors.goldMuted} />
          <Text style={styles.txt}>{r.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  txt: {
    flex: 1,
    ...typography.micro,
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
});
