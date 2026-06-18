import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchBuyerPaymentMethods,
  type BuyerPaymentMethodRow,
} from '../../api/buyerWalletRepository';
import {
  fetchLiveBuyerPaymentSession,
  setLiveBuyerPaymentMethod,
} from '../../api/liveBuyerPaymentRepository';
import {
  LIVE_TIP_MAX_USD,
  LIVE_TIP_MIN_USD,
  LIVE_TIP_PRESET_AMOUNTS_USD,
  sendLiveTipWithSavedCard,
} from '../../api/liveTipsRepository';
import { colors, radii, spacing } from '../../theme';
import { formatTipPaymentMethodLabel } from './liveTipPayment';

type Props = {
  visible: boolean;
  onClose: () => void;
  liveRoomId: string;
  accessToken: string;
  paymentMethodId?: string | null;
  onPaymentMethodIdChange?: (paymentMethodId: string | null) => void;
  onOpenWallet?: () => void;
  onSuccess?: () => void;
  onError: (message: string) => void;
};

export function LiveTipSheet({
  visible,
  onClose,
  liveRoomId,
  accessToken,
  paymentMethodId,
  onPaymentMethodIdChange,
  onOpenWallet,
  onSuccess,
  onError,
}: Props) {
  const insets = useSafeAreaInsets();
  const { confirmPayment } = useStripe();
  const [amountUsd, setAmountUsd] = useState(10);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingPm, setLoadingPm] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<BuyerPaymentMethodRow[]>([]);
  const [selectedPmId, setSelectedPmId] = useState<string | null>(paymentMethodId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const refreshPaymentMethod = useCallback(async () => {
    if (!visible || !accessToken.trim()) return;
    setLoadingPm(true);
    try {
      const [session, pmRes] = await Promise.all([
        fetchLiveBuyerPaymentSession(accessToken, liveRoomId),
        fetchBuyerPaymentMethods(accessToken),
      ]);
      setPaymentMethods(pmRes.paymentMethods);
      const nextId =
        paymentMethodId?.trim() ||
        session?.activePaymentMethodId?.trim() ||
        pmRes.paymentMethods.find((pm) => pm.isDefault)?.id ||
        pmRes.paymentMethods[0]?.id ||
        null;
      setSelectedPmId(nextId);
      onPaymentMethodIdChange?.(nextId);
    } finally {
      setLoadingPm(false);
    }
  }, [accessToken, liveRoomId, onPaymentMethodIdChange, paymentMethodId, visible]);

  useEffect(() => {
    if (!visible) return;
    setAmountUsd(10);
    setCustomAmount('');
    setMessage('');
    setBusy(false);
    setPickerOpen(false);
    void refreshPaymentMethod();
  }, [visible, liveRoomId, refreshPaymentMethod]);

  useEffect(() => {
    if (paymentMethodId?.trim()) setSelectedPmId(paymentMethodId.trim());
  }, [paymentMethodId]);

  const submit = async () => {
    const custom = customAmount.trim() ? Number(customAmount) : NaN;
    const finalAmount = customAmount.trim() ? custom : amountUsd;
    if (!Number.isFinite(finalAmount) || finalAmount < LIVE_TIP_MIN_USD || finalAmount > LIVE_TIP_MAX_USD) {
      onError(`Enter a tip between $${LIVE_TIP_MIN_USD} and $${LIVE_TIP_MAX_USD}.`);
      return;
    }
    if (!selectedPmId?.trim()) {
      onError('Add a saved payment method in Vault Wallet before tipping.');
      onOpenWallet?.();
      return;
    }
    setBusy(true);
    try {
      const result = await sendLiveTipWithSavedCard(accessToken, liveRoomId, {
        amountUsd: finalAmount,
        message: message.trim() || undefined,
        paymentMethodId: selectedPmId,
      });
      if ('requiresAction' in result) {
        const conf = await confirmPayment(result.clientSecret, { paymentMethodType: 'Card' });
        if (conf.error) {
          onError(conf.error.message ?? 'Payment confirmation failed.');
          return;
        }
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not send tip.');
    } finally {
      setBusy(false);
    }
  };

  const pickMethod = (pm: BuyerPaymentMethodRow) => {
    setSelectedPmId(pm.id);
    onPaymentMethodIdChange?.(pm.id);
    setPickerOpen(false);
    void setLiveBuyerPaymentMethod(accessToken, liveRoomId, pm.id).catch((e) => {
      onError(e instanceof Error ? e.message : 'Could not update payment method.');
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Send a tip</Text>
          <Pressable onPress={onClose} hitSlop={12} disabled={busy}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.helper}>
            Tips use your Vault Wallet card for this room. Get Vaulted does not take a platform fee from tips.
          </Text>

          <Text style={styles.label}>Payment method</Text>
          <Pressable
            style={styles.pmRow}
            disabled={busy || loadingPm}
            onPress={() => (paymentMethods.length > 1 ? setPickerOpen((v) => !v) : onOpenWallet?.())}
          >
            {loadingPm ? (
              <ActivityIndicator color={colors.gold} size="small" />
            ) : (
              <>
                <Ionicons name="card-outline" size={18} color={colors.gold} />
                <Text style={styles.pmLabel} numberOfLines={1}>
                  {formatTipPaymentMethodLabel(paymentMethods, selectedPmId)}
                </Text>
                <Text style={styles.pmAction}>{paymentMethods.length > 1 ? 'Change' : 'Wallet'}</Text>
              </>
            )}
          </Pressable>
          {pickerOpen ? (
            <View style={styles.pmPicker}>
              {paymentMethods.map((pm) => (
                <Pressable
                  key={pm.id}
                  style={[styles.pmOption, pm.id === selectedPmId && styles.pmOptionOn]}
                  onPress={() => pickMethod(pm)}
                >
                  <Text style={styles.pmOptionTxt}>{formatTipPaymentMethodLabel(paymentMethods, pm.id)}</Text>
                </Pressable>
              ))}
              {onOpenWallet ? (
                <Pressable style={styles.pmOption} onPress={onOpenWallet}>
                  <Text style={[styles.pmOptionTxt, { color: colors.gold }]}>Manage in Vault Wallet</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.label}>Amount</Text>
          <View style={styles.amountRow}>
            {LIVE_TIP_PRESET_AMOUNTS_USD.map((amt) => {
              const on = !customAmount && amountUsd === amt;
              return (
                <Pressable
                  key={amt}
                  disabled={busy}
                  style={[styles.amountChip, on && styles.amountChipOn]}
                  onPress={() => {
                    setAmountUsd(amt);
                    setCustomAmount('');
                  }}
                >
                  <Text style={[styles.amountChipTxt, on && styles.amountChipTxtOn]}>${amt}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={customAmount}
            onChangeText={setCustomAmount}
            editable={!busy}
            keyboardType="decimal-pad"
            placeholder={`Custom $${LIVE_TIP_MIN_USD}–$${LIVE_TIP_MAX_USD}`}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Text style={styles.label}>Message (optional)</Text>
          <TextInput
            value={message}
            onChangeText={(t) => setMessage(t.slice(0, 280))}
            editable={!busy}
            multiline
            placeholder="Say thanks or hype the room"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.textArea]}
          />
        </ScrollView>
        <Pressable style={[styles.submit, busy && styles.submitOff]} disabled={busy} onPress={() => void submit()}>
          {busy ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.submitTxt}>Send tip</Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  body: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  helper: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  pmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radii.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  pmLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  pmAction: { fontSize: 12, fontWeight: '800', color: colors.gold },
  pmPicker: { gap: 6, marginTop: 4 },
  pmOption: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  pmOptionOn: { borderColor: 'rgba(212,175,55,0.45)', backgroundColor: 'rgba(212,175,55,0.1)' },
  pmOptionTxt: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  amountChip: {
    minWidth: 64,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  amountChipOn: { borderColor: 'rgba(212,175,55,0.5)', backgroundColor: 'rgba(212,175,55,0.12)' },
  amountChipTxt: { fontSize: 14, fontWeight: '800', color: colors.textSecondary },
  amountChipTxtOn: { color: colors.gold },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radii.md,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  submit: {
    marginHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
  },
  submitOff: { opacity: 0.6 },
  submitTxt: { fontSize: 14, fontWeight: '900', color: colors.background },
});
