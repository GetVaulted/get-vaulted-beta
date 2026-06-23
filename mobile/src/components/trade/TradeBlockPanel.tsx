import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

/** Wraps the trade desk sections — incoming, sent, active, and completed deals. */
export function TradeBlockPanel({ children }: { children: ReactNode }) {
  return (
    <View style={styles.shell}>
      <View style={styles.head}>
        <Text style={styles.kicker}>Trade block</Text>
        <Text style={styles.sub}>Your offers, negotiations, and active vault deals.</Text>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.22)',
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  head: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
    gap: 4,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  sub: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 18,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
});
