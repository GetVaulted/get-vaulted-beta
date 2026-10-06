import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createOrderRefundRequest,
  fetchOrderRefundRequestState,
  patchOrderRefundRequest,
  type OrderRefundRequestState,
} from '../../api/orderRefundRequestRepository';
import { colors, radii, spacing } from '../../theme';

function statusLabel(status: string): string {
  switch (status) {
    case 'pending_seller':
      return 'Awaiting seller';
    case 'seller_denied':
      return 'Denied by seller';
    case 'escalated':
      return 'With support';
    case 'awaiting_return':
      return 'Ship item back';
    case 'return_in_transit':
      return 'Return in transit';
    case 'refund_processing':
      return 'Processing';
    case 'support_denied':
      return 'Support denied';
    case 'refunded':
      return 'Completed';
    default:
      return status.replace(/_/g, ' ');
  }
}

function blockedMessage(code: string | null): string {
  switch (code) {
    case 'LABEL_EXISTS':
      return 'Cancel is unavailable after a Get Vaulted shipping label is created.';
    case 'IN_TRANSIT':
      return 'Cancel and return requests are unavailable while the package is in transit. Wait until delivery.';
    case 'RETURN_WINDOW_EXPIRED':
      return 'The 2-day return window after delivery has expired.';
    case 'NOT_PAID':
      return 'This order is not eligible for a refund yet.';
    case 'ALREADY_REFUNDED':
      return 'This order has already been refunded.';
    case 'ESCROW_NOT_SUPPORTED':
      return 'Escrow orders must be handled through the escrow provider.';
    default:
      return 'This order is not eligible for a refund request right now.';
  }
}

type Props = {
  accessToken: string | undefined;
  orderId: string;
  role: 'buyer' | 'seller';
};

export function OrderRefundRequestSection({ accessToken, orderId, role }: Props) {
  const [state, setState] = useState<OrderRefundRequestState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionLabel, setActionLabel] = useState<string | null>(null);
  const [justCompleted, setJustCompleted] = useState(false);
  const [reason, setReason] = useState('');
  const [photoUrlsText, setPhotoUrlsText] = useState('');
  const [denyReason, setDenyReason] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const busyRef = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!accessToken) return;
      if (!opts?.silent) setLoading(true);
      try {
        const row = await fetchOrderRefundRequestState(accessToken, orderId);
        setState(row);
      } catch {
        if (!opts?.silent) setState(null);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [accessToken, orderId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (!accessToken || loading) {
    return loading ? <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.md }} /> : null;
  }

  if (!state) return null;

  const eligibility = state.eligibility;
  const request = state.request;
  const completed =
    justCompleted || request?.status === 'refunded' || eligibility?.blockedReason === 'ALREADY_REFUNDED';

  async function runAction(
    label: string,
    work: () => Promise<void>,
    opts?: { successMsg?: string; markCompleted?: boolean },
  ) {
    if (!accessToken || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionLabel(label);
    try {
      await work();
      await load({ silent: true });
      if (opts?.markCompleted) setJustCompleted(true);
      if (opts?.successMsg) Alert.alert(opts.markCompleted ? 'Completed' : 'Updated', opts.successMsg);
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
    } finally {
      busyRef.current = false;
      setBusy(false);
      setActionLabel(null);
    }
  }

  async function runPatch(
    body: Record<string, unknown>,
    opts?: { successMsg?: string; markCompleted?: boolean },
  ) {
    await runAction('Processing', async () => {
      await patchOrderRefundRequest(accessToken!, orderId, body);
    }, opts);
  }

  const processingUi = busy ? (
    <View style={[styles.statusBox, styles.statusProcessing]}>
      <View style={styles.btnInner}>
        <ActivityIndicator color={colors.gold} size="small" />
        <Text style={styles.statusLabel}>Processing</Text>
      </View>
      <Text style={styles.sub}>Please wait — do not tap again.</Text>
    </View>
  ) : null;

  const btnContent = (label: string, textStyle?: object) =>
    busy && actionLabel ? (
      <View style={styles.btnInner}>
        <ActivityIndicator color={colors.textPrimary} size="small" />
        <Text style={[styles.btnTxt, textStyle]}>Processing</Text>
      </View>
    ) : (
      <Text style={[styles.btnTxt, textStyle]}>{label}</Text>
    );

  if (completed && role === 'seller') {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.title}>Cancel & refund</Text>
        </View>
        <View style={[styles.statusBox, styles.statusCompleted]}>
          <Text style={styles.statusCompletedLabel}>Completed</Text>
          <Text style={styles.sub}>This order was cancelled and the buyer was refunded.</Text>
        </View>
      </View>
    );
  }

  if (!eligibility?.kind && !request) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name="return-down-back-outline" size={18} color={colors.gold} />
          <Text style={styles.title}>Cancel & refund</Text>
        </View>
        <Text style={styles.sub}>{blockedMessage(eligibility?.blockedReason ?? null)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="return-down-back-outline" size={18} color={colors.gold} />
        <Text style={styles.title}>Cancel & refund</Text>
      </View>
      <Text style={styles.sub}>
        {eligibility?.kind === 'return'
          ? 'Live show orders: return within 2 days of delivery for a shipping defect (photos required).'
          : 'Request a cancel before the seller ships or creates a Get Vaulted label. The seller must approve before a full refund is issued.'}
      </Text>

      {processingUi}

      {request && !busy ? (
        <View style={[styles.statusBox, request.status === 'refunded' && styles.statusCompleted]}>
          <Text
            style={request.status === 'refunded' ? styles.statusCompletedLabel : styles.statusLabel}
          >
            {statusLabel(request.status)}
          </Text>
          <Text style={styles.reason}>{request.reason}</Text>
          {request.sellerDenyReason ? (
            <Text style={styles.denyNote}>Seller: {request.sellerDenyReason}</Text>
          ) : null}
        </View>
      ) : null}

      {!request && role === 'buyer' && eligibility.kind ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={eligibility.kind === 'return' ? 'Describe shipping defect…' : 'Why cancel?'}
            placeholderTextColor={colors.textMuted}
            multiline
            editable={!busy}
            style={styles.input}
          />
          {eligibility.kind === 'return' ? (
            <TextInput
              value={photoUrlsText}
              onChangeText={setPhotoUrlsText}
              placeholder="Photo URLs (one per line)"
              placeholderTextColor={colors.textMuted}
              multiline
              editable={!busy}
              style={styles.input}
            />
          ) : null}
          <Pressable
            disabled={busy}
            style={[styles.btn, styles.btnGold, busy && styles.btnDisabled]}
            onPress={() => {
              void runAction('Processing', async () => {
                const photoUrls = photoUrlsText
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean);
                await createOrderRefundRequest(accessToken, orderId, {
                  kind: eligibility.kind!,
                  reason,
                  photoUrls,
                });
                setReason('');
                setPhotoUrlsText('');
              });
            }}
          >
            {btnContent(
              eligibility.kind === 'cancel' ? 'Request cancel & refund' : 'Request return & refund',
            )}
          </Pressable>
        </View>
      ) : null}

      {request?.status === 'pending_seller' && role === 'seller' ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Pressable
            disabled={busy}
            style={[styles.btn, styles.btnGreen, busy && styles.btnDisabled]}
            onPress={() =>
              void runPatch(
                { action: 'seller_respond', approve: true },
                { successMsg: 'Request approved' },
              )
            }
          >
            {btnContent('Approve')}
          </Pressable>
          <TextInput
            value={denyReason}
            onChangeText={setDenyReason}
            placeholder="Deny reason"
            placeholderTextColor={colors.textMuted}
            editable={!busy}
            style={styles.input}
          />
          <Pressable
            disabled={busy}
            style={[styles.btn, styles.btnMuted, busy && styles.btnDisabled]}
            onPress={() => void runPatch({ action: 'seller_respond', approve: false, denyReason })}
          >
            {btnContent('Deny', styles.btnTxtMuted)}
          </Pressable>
        </View>
      ) : null}

      {!request && role === 'seller' && eligibility.kind === 'cancel' ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Explain why you are cancelling…"
            placeholderTextColor={colors.textMuted}
            multiline
            editable={!busy}
            style={styles.input}
          />
          <Pressable
            disabled={busy || reason.trim().length < 3}
            style={[
              styles.btn,
              styles.btnDanger,
              (busy || reason.trim().length < 3) && styles.btnDisabled,
            ]}
            onPress={() =>
              void runPatch(
                { action: 'seller_direct_cancel', reason },
                { successMsg: 'Refund issued', markCompleted: true },
              )
            }
          >
            {btnContent('Cancel & refund directly')}
          </Pressable>
        </View>
      ) : null}

      {request?.status === 'seller_denied' && role === 'buyer' ? (
        <Pressable
          disabled={busy}
          style={[styles.btn, styles.btnGold, { marginTop: spacing.md }, busy && styles.btnDisabled]}
          onPress={() =>
            void runPatch({ action: 'buyer_escalate' }, { successMsg: 'Escalated to support' })
          }
        >
          {btnContent('Escalate to support')}
        </Pressable>
      ) : null}

      {(request?.status === 'awaiting_return' || request?.status === 'return_in_transit') && role === 'buyer' ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Text style={styles.sub}>You pay return shipping. Add tracking when shipped.</Text>
          <TextInput
            value={trackingNumber}
            onChangeText={setTrackingNumber}
            placeholder="Tracking number"
            placeholderTextColor={colors.textMuted}
            editable={!busy}
            style={styles.input}
          />
          <Pressable
            disabled={busy}
            style={[styles.btn, styles.btnGold, busy && styles.btnDisabled]}
            onPress={() => void runPatch({ action: 'buyer_return_tracking', trackingNumber })}
          >
            {btnContent('Save tracking')}
          </Pressable>
        </View>
      ) : null}

      {(request?.status === 'return_in_transit' || request?.status === 'awaiting_return') &&
      role === 'seller' &&
      request.kind === 'return' ? (
        <Pressable
          disabled={busy}
          style={[styles.btn, styles.btnGreen, { marginTop: spacing.md }, busy && styles.btnDisabled]}
          onPress={() =>
            void runPatch(
              { action: 'seller_confirm_return' },
              { successMsg: 'Refund issued', markCompleted: true },
            )
          }
        >
          {btnContent('Confirm return received')}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  statusBox: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    gap: 4,
  },
  statusProcessing: {
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  statusCompleted: {
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.35)',
    backgroundColor: 'rgba(52,199,89,0.08)',
  },
  statusLabel: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  statusCompletedLabel: { color: colors.success, fontWeight: '800', fontSize: 14 },
  reason: { color: colors.textPrimary, fontSize: 13, marginTop: 4 },
  denyNote: { color: '#fbbf24', fontSize: 12, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
    color: colors.textPrimary,
    minHeight: 44,
  },
  btn: {
    borderRadius: radii.pill,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnDisabled: { opacity: 0.7 },
  btnGold: { backgroundColor: 'rgba(212,175,55,0.15)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)' },
  btnGreen: { backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)' },
  btnDanger: { backgroundColor: 'rgba(244,63,94,0.12)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.35)' },
  btnMuted: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  btnTxt: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  btnTxtMuted: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
});
