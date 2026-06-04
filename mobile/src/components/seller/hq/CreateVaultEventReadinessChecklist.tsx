import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SellerLiveReadiness } from '../../../api/liveHostRepository';
import { colors, radii, spacing } from '../../../theme';

function CheckIcon({ done }: { done: boolean }) {
  return (
    <View style={[styles.check, done && styles.checkDone]}>
      {done ? <Ionicons name="checkmark" size={12} color={colors.gold} /> : null}
    </View>
  );
}

export function CreateVaultEventReadinessChecklist({
  readiness,
  loading,
  titleComplete,
  onFixStripe,
  onFixShipFrom,
}: {
  readiness: SellerLiveReadiness | null;
  loading: boolean;
  titleComplete: boolean;
  onFixStripe: () => void;
  onFixShipFrom: () => void;
}) {
  const checks = readiness?.checks ?? {};
  const canGoLive = readiness?.canGoLive === true;
  const stripeOk =
    canGoLive ||
    (checks.hasStripeAccount === true && checks.stripeChargesEnabled === true);
  const shipFromOk = canGoLive || checks.hasShipFromAddress === true;
  const altCheckoutOk = canGoLive || checks.alternateCheckoutSellerReady === true;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Go live readiness</Text>
        {loading ? (
          <Text style={styles.badgeMuted}>Checking…</Text>
        ) : !readiness ? (
          <Text style={styles.badgeMuted}>Not verified</Text>
        ) : canGoLive ? (
          <Text style={styles.badgeReady}>Ready</Text>
        ) : (
          <Text style={styles.badgeWarn}>Set up required</Text>
        )}
      </View>

      <ChecklistRow
        done={stripeOk}
        label="Payouts setup"
        fixLabel={stripeOk ? undefined : 'Set up'}
        onFix={stripeOk ? undefined : onFixStripe}
      />
      <ChecklistRow
        done={shipFromOk}
        label="Shipping address"
        fixLabel={shipFromOk ? undefined : 'Add'}
        onFix={shipFromOk ? undefined : onFixShipFrom}
      />
      {!altCheckoutOk ? (
        <ChecklistRow
          done={false}
          label="High-value checkout seller link"
          fixLabel="Contact support"
        />
      ) : null}
      <ChecklistRow done={titleComplete} label="Show title entered" />

      {readiness && !canGoLive && readiness.issues.length > 0 ? (
        <View style={styles.issues}>
          <Text style={styles.issuesLabel}>Almost there</Text>
          {readiness.issues.map((issue) => (
            <Text key={issue} style={styles.issueLine}>
              • {issue}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ChecklistRow({
  done,
  label,
  fixLabel,
  onFix,
}: {
  done: boolean;
  label: string;
  fixLabel?: string;
  onFix?: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <CheckIcon done={done} />
        <Text style={[styles.rowLabel, done && styles.rowLabelDone]}>{label}</Text>
      </View>
      {fixLabel && onFix ? (
        <Pressable onPress={onFix} hitSlop={8}>
          <Text style={styles.fixLink}>{fixLabel} →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  badgeReady: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: '#86efac',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.35)',
    backgroundColor: 'rgba(6,78,59,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  badgeWarn: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: colors.gold,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  badgeMuted: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: {
    borderColor: 'rgba(212,175,55,0.5)',
    backgroundColor: 'rgba(212,175,55,0.15)',
  },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.textMuted, flex: 1 },
  rowLabelDone: { color: colors.textPrimary },
  fixLink: { fontSize: 12, fontWeight: '800', color: colors.gold },
  issues: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  issuesLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.textMuted,
    marginBottom: 4,
  },
  issueLine: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
});
