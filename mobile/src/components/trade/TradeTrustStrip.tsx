import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

const ROWS = [
  { icon: 'person-circle-outline' as const, text: 'Secure collector account required' },
  { icon: 'shield-checkmark-outline' as const, text: 'Verified profiles & vault-authenticated inventory' },
  {
    icon: 'ribbon-outline' as const,
    text: 'Protected labels, tracking, and dispute support on every trade',
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    maxWidth: '100%',
  },
  txt: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    flexShrink: 1,
  },
});
