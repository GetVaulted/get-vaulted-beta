import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
  LIVE_TIP_MAX_USD,
  LIVE_TIP_MIN_USD,
  LIVE_TIP_PRESET_AMOUNTS_USD,
  startLiveTipCheckout,
} from '../../api/liveTipsRepository';
import { colors, radii, spacing } from '../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  liveRoomId: string;
  accessToken: string;
  onError: (message: string) => void;
};

export function LiveTipSheet({ visible, onClose, liveRoomId, accessToken, onError }: Props) {
  const insets = useSafeAreaInsets();
  const [amountUsd, setAmountUsd] = useState(10);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAmountUsd(10);
    setCustomAmount('');
    setMessage('');
    setBusy(false);
  }, [visible, liveRoomId]);

  const submit = async () => {
    const custom = customAmount.trim() ? Number(customAmount) : NaN;
    const finalAmount = customAmount.trim() ? custom : amountUsd;
    if (!Number.isFinite(finalAmount) || finalAmount < LIVE_TIP_MIN_USD || finalAmount > LIVE_TIP_MAX_USD) {
      onError(`Enter a tip between $${LIVE_TIP_MIN_USD} and $${LIVE_TIP_MAX_USD}.`);
      return;
    }
    setBusy(true);
    try {
      const { url } = await startLiveTipCheckout(accessToken, liveRoomId, {
        amountUsd: finalAmount,
        message: message.trim() || undefined,
      });
      await Linking.openURL(url);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not start tip checkout.');
    } finally {
      setBusy(false);
    }
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
            Get Vaulted does not take a platform fee from tips. Standard payment processing still applies.
          </Text>
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
            <Text style={styles.submitTxt}>Continue to payment</Text>
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
