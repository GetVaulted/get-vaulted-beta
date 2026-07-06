import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { submitMarketplaceOffer } from '../../api/marketplaceCommerceRepository';
import { PremiumVaultButton } from '../product/PremiumVaultButton';
import { MARKETPLACE_TEXT_PROPS } from '../../lib/marketplaceUiScale';
import { colors, radii, spacing } from '../../theme';

function parseOfferAmount(raw: string): number | null {
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  askingPrice: string;
  accessToken: string;
  minimumOfferUsd?: number;
  onSuccess?: () => void;
};

export function MarketplaceMakeOfferSheet({
  visible,
  onClose,
  listingId,
  listingTitle,
  askingPrice,
  accessToken,
  minimumOfferUsd,
  onSuccess,
}: Props) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setAmount('');
      setMessage('');
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const submit = async () => {
    setError(null);
    const n = parseOfferAmount(amount);
    if (n == null || amount.trim() === '') {
      setError('Enter a valid offer amount.');
      return;
    }
    if (n <= 0) {
      setError('Offer must be greater than zero.');
      return;
    }
    if (minimumOfferUsd != null && n < minimumOfferUsd) {
      setError(`Offers must be at least $${minimumOfferUsd.toLocaleString('en-US')}.`);
      return;
    }
    setSubmitting(true);
    try {
      await submitMarketplaceOffer(accessToken, {
        listingId,
        amountUsd: n,
        message: message.trim() || undefined,
      });
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Offer could not be sent.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.handle} />
          <Text style={styles.title} {...MARKETPLACE_TEXT_PROPS}>
            Make an offer
          </Text>
          <Text style={styles.subtitle} numberOfLines={2} {...MARKETPLACE_TEXT_PROPS}>
            {listingTitle}
          </Text>
          <View style={styles.askRow}>
            <Text style={styles.askLbl} {...MARKETPLACE_TEXT_PROPS}>
              Asking price
            </Text>
            <Text style={styles.askVal} {...MARKETPLACE_TEXT_PROPS}>
              {askingPrice}
            </Text>
          </View>

          <Text style={styles.fieldLbl} {...MARKETPLACE_TEXT_PROPS}>
            Offer amount (USD)
          </Text>
          <TextInput
            value={amount}
            onChangeText={(t) => {
              setAmount(t);
              setError(null);
            }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            allowFontScaling={false}
          />

          <Text style={styles.fieldLbl} {...MARKETPLACE_TEXT_PROPS}>
            Message (optional)
          </Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            multiline
            placeholder="Introduce yourself or add context for the seller."
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.textArea]}
            allowFontScaling={false}
          />

          {error ? (
            <Text style={styles.error} {...MARKETPLACE_TEXT_PROPS}>
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <PremiumVaultButton label="Cancel" onPress={onClose} variant="secondary" flex />
            <PremiumVaultButton
              label={submitting ? 'Sending…' : 'Submit offer'}
              onPress={() => void submit()}
              variant="primary"
              flex
              disabled={submitting}
            />
          </View>
          {submitting ? <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.sm }} /> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.xs,
  },
  title: { fontSize: 20, fontWeight: '900', color: colors.textPrimary },
  subtitle: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  askRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  askLbl: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  askVal: { color: colors.gold, fontSize: 15, fontWeight: '900' },
  fieldLbl: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  error: { color: '#FF8A80', fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
