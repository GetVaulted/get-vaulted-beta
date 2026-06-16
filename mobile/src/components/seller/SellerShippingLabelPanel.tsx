import * as Clipboard from 'expo-clipboard';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  orderHasLabelFile,
  orderHasPurchasedLabel,
  sellerTrackingStatusLabel,
} from '../../lib/sellerShippingLabelState';
import { colors, radii, spacing } from '../../theme';

export type SellerShippingLabelPanelProps = {
  orderId: string;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  shippoTransactionId: string | null;
  labelCreatedAt: string | null;
  fulfillmentStatus: string;
  shippingStatus: string | null;
  onRepairLabel?: () => void | Promise<void>;
  repairLabelBusy?: boolean;
  onRegenerateLabel?: () => void | Promise<void>;
  regenerateLabelBusy?: boolean;
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function openUrl(url: string) {
  void Linking.openURL(url).catch(() => {
    Alert.alert('Could not open link', 'Try again or open Seller Studio on desktop.');
  });
}

function openSupport() {
  void Linking.openURL('mailto:support@shopgetvaulted.com?subject=Missing%20shipping%20label').catch(() => {
    Alert.alert('Contact support', 'Email support@shopgetvaulted.com');
  });
}

function ActionButton({
  label,
  onPress,
  primary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.btn, primary && styles.btnPrimary, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.btnTxt, primary && styles.btnTxtPrimary, disabled && styles.btnTxtDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function SellerShippingLabelPanel(props: SellerShippingLabelPanelProps) {
  const purchased = orderHasPurchasedLabel(props);
  const hasFile = orderHasLabelFile(props.labelUrl);
  const canRepair =
    purchased && !hasFile && Boolean(props.shippoTransactionId?.trim()) && props.onRepairLabel;
  const canRegenerate = purchased && !hasFile && props.onRegenerateLabel;
  const actionBusy = props.repairLabelBusy || props.regenerateLabelBusy;

  if (!purchased) return null;

  const copyTracking = async () => {
    if (!props.trackingNumber?.trim()) return;
    await Clipboard.setStringAsync(props.trackingNumber.trim());
    Alert.alert('Copied', 'Tracking number copied to clipboard.');
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.kicker}>Shipping label</Text>
      <Text style={styles.hint}>
        {hasFile ? 'Print, download, or share tracking.' : 'Recover or regenerate your label below.'}
      </Text>

      {!hasFile ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>Label file missing</Text>
          <Text style={styles.warnBody}>
            The label was purchased but the PDF is not available. Retry lookup or regenerate a new label.
          </Text>
          <View style={styles.actions}>
            {canRepair ? (
              <ActionButton
                label={props.repairLabelBusy ? 'Looking up…' : 'Retry lookup'}
                primary
                disabled={actionBusy}
                onPress={() => void props.onRepairLabel!()}
              />
            ) : null}
            {canRegenerate ? (
              <ActionButton
                label={props.regenerateLabelBusy ? 'Regenerating…' : 'Regenerate label'}
                primary={!canRepair}
                disabled={actionBusy}
                onPress={() => void props.onRegenerateLabel!()}
              />
            ) : null}
            <ActionButton label="Contact support" onPress={openSupport} disabled={actionBusy} />
          </View>
        </View>
      ) : null}

      {hasFile ? (
        <View style={styles.actions}>
          <ActionButton label="Print label" primary onPress={() => openUrl(props.labelUrl!)} />
          <ActionButton label="Download" onPress={() => openUrl(props.labelUrl!)} />
          {props.trackingNumber?.trim() ? (
            <ActionButton label="Copy tracking" onPress={() => void copyTracking()} />
          ) : null}
          {props.trackingUrl?.trim() ? (
            <ActionButton label="Open tracking" onPress={() => openUrl(props.trackingUrl!)} />
          ) : null}
        </View>
      ) : null}

      <View style={styles.grid}>
        <Meta label="Carrier" value={props.carrier?.trim() || '—'} />
        <Meta label="Service" value={props.service?.trim() || '—'} />
        <Meta label="Tracking" value={props.trackingNumber?.trim() || '—'} mono full />
        <Meta
          label="Status"
          value={sellerTrackingStatusLabel(props.fulfillmentStatus, props.shippingStatus)}
        />
        <Meta label="Created" value={formatDate(props.labelCreatedAt)} full />
      </View>

      {actionBusy ? <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xs }} /> : null}
    </View>
  );
}

function Meta({
  label,
  value,
  mono,
  full,
}: {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <View style={[styles.meta, full && styles.metaFull]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, mono && styles.mono]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.28)',
    backgroundColor: 'rgba(14,116,144,0.1)',
    gap: spacing.sm,
  },
  kicker: {
    color: '#7DD3FC',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  warnBox: {
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    backgroundColor: 'rgba(120,53,15,0.22)',
    gap: spacing.xs,
  },
  warnTitle: { color: '#FFD699', fontSize: 13, fontWeight: '700' },
  warnBody: { color: '#FFE4B5', fontSize: 12, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  meta: { width: '47%', gap: 2 },
  metaFull: { width: '100%' },
  metaLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  metaValue: { color: colors.textPrimary, fontSize: 13 },
  mono: { fontFamily: 'monospace', fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  btn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  btnPrimary: { borderColor: colors.gold, backgroundColor: `${colors.gold}18` },
  btnDisabled: { opacity: 0.5 },
  btnTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  btnTxtPrimary: { color: colors.gold },
  btnTxtDisabled: { color: colors.textMuted },
});
