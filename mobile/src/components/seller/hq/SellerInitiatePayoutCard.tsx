import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  fetchSellerSelfPayoutSummary,
  initiateSellerSelfPayout,
  type SellerSelfPayoutSummaryDTO,
} from '../../../api/sellerSelfPayoutRepository';
import { colors, spacing } from '../../../theme';
import { hq } from './hqStyles';
import { StudioPrimaryButton, StudioSection } from './SellerStudioUI';

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** "Initiate Payout": send your shipped, ready earnings to your bank (mirrors web Seller financials). */
export function SellerInitiatePayoutCard({
  accessToken,
  onPaidOut,
}: {
  accessToken: string | undefined;
  onPaidOut?: () => void;
}) {
  const [summary, setSummary] = useState<SellerSelfPayoutSummaryDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setSummary(await fetchSellerSelfPayoutSummary(accessToken));
    } catch {
      // Keep whatever we had; the rest of the screen still works.
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(async () => {
    if (!accessToken || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await initiateSellerSelfPayout(accessToken);
      setNotice({ ok: res.ok, text: res.message });
      if (res.ok) onPaidOut?.();
    } finally {
      setBusy(false);
      void load();
    }
  }, [accessToken, busy, load, onPaidOut]);

  const confirm = () => {
    if (!summary?.canInitiate) return;
    Alert.alert(
      'Send payout to your bank?',
      `${usd(summary.payableUsd)} will be sent to your bank. Banks usually show it in 1-2 business days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: `Send ${usd(summary.payableUsd)}`, onPress: () => void send() },
      ],
    );
  };

  // Sellers without a Stripe account (e.g. PayPal sellers) keep their current flow.
  if (!accessToken || !summary || summary.blockedReason === 'no_stripe_account') return null;

  return (
    <StudioSection title="Initiate payout" subtitle="Send your shipped earnings to your bank whenever you want.">
      <View style={[styles.card, hq.goldCard]}>
        <Text style={styles.eyebrow}>Available in your Stripe balance</Text>
        <Text style={styles.amount}>{usd(summary.availableUsd ?? summary.payableUsd)}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Ready to send to your bank</Text>
          <Text style={styles.rowValue}>{usd(summary.payableUsd)}</Text>
        </View>
        {(summary.waitingUsd ?? 0) >= 0.01 ? (
          <View style={styles.row}>
            <Text style={styles.rowLabelMuted}>Unlocks when orders ship</Text>
            <Text style={styles.rowLabelMuted}>{usd(summary.waitingUsd ?? 0)}</Text>
          </View>
        ) : null}
        <Text style={[styles.msg, notice && !notice.ok && styles.msgError, notice?.ok && styles.msgOk]}>
          {notice ? notice.text : summary.message}
        </Text>
        <StudioPrimaryButton
          label={busy ? 'Sending…' : 'Initiate payout'}
          icon="cash-outline"
          disabled={!summary.canInitiate || busy}
          onPress={confirm}
        />
      </View>
    </StudioSection>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  amount: { color: colors.gold, fontSize: 30, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  rowLabel: { color: colors.textSecondary, fontSize: 13 },
  rowValue: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  rowLabelMuted: { color: colors.textMuted, fontSize: 12 },
  msg: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  msgError: { color: '#FCA5A5' },
  msgOk: { color: '#A7F3D0' },
});
