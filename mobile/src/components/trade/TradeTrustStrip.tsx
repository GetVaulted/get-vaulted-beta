import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { TRADE_COVERS_BULLETS } from '../../data/tradeTrustCopy';
import { colors, radii, spacing } from '../../theme';

const ICONS = ['document-text-outline', 'pricetag-outline', 'notifications-outline'] as const;

/** Honest “what Get Vaulted covers” chips for Trade Center home. */
export function TradeTrustStrip() {
  return (
    <View style={styles.box}>
      {TRADE_COVERS_BULLETS.map((text, i) => (
        <View key={text} style={styles.row}>
          <Ionicons name={ICONS[i] ?? 'checkmark-circle-outline'} size={16} color={colors.goldMuted} />
          <Text style={styles.txt}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  txt: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 17,
  },
});
