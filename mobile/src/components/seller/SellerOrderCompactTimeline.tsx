import { StyleSheet, Text, View } from 'react-native';
import type { SellerTimelineStep } from '../../lib/sellerOrderDetailDisplay';
import { colors, radii, spacing } from '../../theme';

export function SellerOrderCompactTimeline({ steps }: { steps: SellerTimelineStep[] }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>Fulfillment</Text>
      <View style={styles.row}>
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          const dotStyle =
            step.state === 'complete'
              ? styles.dotComplete
              : step.state === 'current'
                ? styles.dotCurrent
                : styles.dotUpcoming;
          const lineStyle =
            step.state === 'complete'
              ? styles.lineComplete
              : step.state === 'current'
                ? styles.lineCurrent
                : styles.lineUpcoming;
          return (
            <View key={step.key} style={styles.step}>
              <View style={styles.dotRow}>
                {!last ? <View style={[styles.line, lineStyle]} /> : null}
                <View style={[styles.dot, dotStyle]}>
                  <Text style={styles.dotTxt}>{step.state === 'complete' ? '✓' : i + 1}</Text>
                </View>
              </View>
              <Text style={[styles.label, step.state === 'upcoming' && styles.labelMuted]} numberOfLines={1}>
                {step.title}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  kicker: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  step: { flex: 1, alignItems: 'center', minWidth: 0 },
  dotRow: { width: '100%', alignItems: 'center', justifyContent: 'center', height: 24 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  dotComplete: { borderColor: '#34D399', backgroundColor: 'rgba(16,185,129,0.15)' },
  dotCurrent: { borderColor: colors.gold, backgroundColor: `${colors.gold}20` },
  dotUpcoming: { borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  dotTxt: { color: colors.textPrimary, fontSize: 9, fontWeight: '800' },
  line: { position: 'absolute', left: '55%', right: '-45%', top: 11, height: 1 },
  lineComplete: { backgroundColor: 'rgba(16,185,129,0.35)' },
  lineCurrent: { backgroundColor: `${colors.gold}55` },
  lineUpcoming: { backgroundColor: colors.border },
  label: { marginTop: 6, color: colors.textPrimary, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  labelMuted: { color: colors.textMuted },
});
