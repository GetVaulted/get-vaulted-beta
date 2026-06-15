import * as Clipboard from 'expo-clipboard';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  orderHasLabelFile,
  orderHasPurchasedLabel,
  sellerTrackingStatusLabel,
} from '../lib/sellerShippingLabelState';
import { colors, radii, spacing } from '../theme';

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
      <Text style={styles.hint}>Print or download your label any time after purchase.</Text>

      <View style={styles.grid}>
        <Meta label="Carrier" value={props.carrier?.trim() || '—'} />
        <Meta label="Service" value={props.service?.trim() || '—'} />
        <Meta label="Tracking number" value={props.trackingNumber?.trim() || '—'} mono />
        <Meta
          label="Tracking status"
          value={sellerTrackingStatusLabel(props.fulfillmentStatus, props.shippingStatus)}
        />
        <Meta label="Label created" value={formatDate(props.labelCreatedAt)} full />
      </View>

      {purchased && !hasFile ? (
        <Text style={styles.warn}>
          Label was created, but the label file is missing. Tap Retrieve label below, or Regenerate label to
          purchase a new one.
        </Text>
      ) : null}

      <View style={styles.actions}>
        {hasFile && props.labelUrl ? (
          <>
            <ActionButton label="Print label" primary onPress={() => openUrl(props.labelUrl!)} />
            <ActionButton label="Download label" onPress={() => openUrl(props.labelUrl!)} />
          </>
        ) : null}
        {props.trackingNumber?.trim() ? (
          <ActionButton label="Copy tracking" onPress={() => void copyTracking()} />
        ) : null}
        {props.trackingUrl?.trim() ? (
          <ActionButton label="Open tracking" onPress={() => openUrl(props.trackingUrl!)} />
        ) : null}
        {canRepair ? (
          <ActionButton
            label={props.repairLabelBusy ? 'Retrieving…' : 'Retrieve label'}
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
      <Text style={[styles.metaValue, mono && styles.mono]}>{value}</Text>
    </View>
  );
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
      <Text style={[styles.btnTxt, primary && styles.btnTxtPrimary, disabled && styles.btnTxtDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.35)',
    backgroundColor: 'rgba(14,116,144,0.12)',
    gap: spacing.sm,
  },
  kicker: {
    color: '#7DD3FC',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  meta: { width: '47%', gap: 2 },
  metaFull: { width: '100%' },
  metaLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  metaValue: { color: colors.textPrimary, fontSize: 14 },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  warn: {
    color: '#FFD699',
    fontSize: 13,
    lineHeight: 18,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    backgroundColor: 'rgba(120,53,15,0.25)',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
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
