import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
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
    case 'support_denied':
      return 'Support denied';
    case 'refunded':
      return 'Refunded';
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
  const [reason, setReason] = useState('');
  const [photoUrlsText, setPhotoUrlsText] = useState('');
  const [denyReason, setDenyReason] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const row = await fetchOrderRefundRequestState(accessToken, orderId);
      setState(row);
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!accessToken || loading) {
    return loading ? <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.md }} /> : null;
  }

  if (!state) return null;

  const eligibility = state.eligibility;
  const request = state.request;

  async function runPatch(body: Record<string, unknown>, successMsg?: string) {
    if (!accessToken) return;
    setBusy(true);
    try {
      await patchOrderRefundRequest(accessToken, orderId, body);
      await load();
      if (successMsg) Alert.alert('Updated', successMsg);
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
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

      {request ? (
        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>{statusLabel(request.status)}</Text>
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
            style={styles.input}
          />
          {eligibility.kind === 'return' ? (
            <TextInput
              value={photoUrlsText}
              onChangeText={setPhotoUrlsText}
              placeholder="Photo URLs (one per line)"
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.input}
            />
          ) : null}
          <Pressable
            disabled={busy}
            style={[styles.btn, styles.btnGold]}
            onPress={() => {
              void (async () => {
                if (!accessToken) return;
                setBusy(true);
                try {
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
                  await load();
                } catch (e) {
                  Alert.alert('Request failed', e instanceof Error ? e.message : 'Try again');
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <Text style={styles.btnTxt}>
              {eligibility.kind === 'cancel' ? 'Request cancel & refund' : 'Request return & refund'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {request?.status === 'pending_seller' && role === 'seller' ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Pressable
            disabled={busy}
            style={[styles.btn, styles.btnGreen]}
            onPress={() => void runPatch({ action: 'seller_respond', approve: true }, 'Request approved')}
          >
            <Text style={styles.btnTxt}>Approve</Text>
          </Pressable>
          <TextInput
            value={denyReason}
            onChangeText={setDenyReason}
            placeholder="Deny reason"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Pressable
            disabled={busy}
            style={[styles.btn, styles.btnMuted]}
            onPress={() => void runPatch({ action: 'seller_respond', approve: false, denyReason })}
          >
            <Text style={styles.btnTxtMuted}>Deny</Text>
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
            style={styles.input}
          />
          <Pressable
            disabled={busy || reason.trim().length < 3}
            style={[styles.btn, styles.btnDanger]}
            onPress={() => void runPatch({ action: 'seller_direct_cancel', reason }, 'Refund issued')}
          >
            <Text style={styles.btnTxt}>Cancel & refund directly</Text>
          </Pressable>
        </View>
      ) : null}

      {request?.status === 'seller_denied' && role === 'buyer' ? (
        <Pressable
          disabled={busy}
          style={[styles.btn, styles.btnGold, { marginTop: spacing.md }]}
          onPress={() => void runPatch({ action: 'buyer_escalate' }, 'Escalated to support')}
        >
          <Text style={styles.btnTxt}>Escalate to support</Text>
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
            style={styles.input}
          />
          <Pressable
            disabled={busy}
            style={[styles.btn, styles.btnGold]}
            onPress={() => void runPatch({ action: 'buyer_return_tracking', trackingNumber })}
          >
            <Text style={styles.btnTxt}>Save tracking</Text>
          </Pressable>
        </View>
      ) : null}

      {(request?.status === 'return_in_transit' || request?.status === 'awaiting_return') &&
      role === 'seller' &&
      request.kind === 'return' ? (
        <Pressable
          disabled={busy}
          style={[styles.btn, styles.btnGreen, { marginTop: spacing.md }]}
          onPress={() => void runPatch({ action: 'seller_confirm_return' }, 'Refund issued')}
        >
          <Text style={styles.btnTxt}>Confirm return received</Text>
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
  },
  statusLabel: { color: colors.gold, fontWeight: '700', fontSize: 13 },
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
  btnGold: { backgroundColor: 'rgba(212,175,55,0.15)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)' },
  btnGreen: { backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)' },
  btnDanger: { backgroundColor: 'rgba(244,63,94,0.12)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.35)' },
  btnMuted: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  btnTxt: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  btnTxtMuted: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
});
