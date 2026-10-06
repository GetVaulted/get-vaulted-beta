import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '../../wallet/walletSheetKeyboard';
import { colors, radii, spacing, vaultColors } from '../../../theme';

/**
 * "+ Add Divisional Supply" — a one-click way to list 8 more spots (one per real NFL division)
 * on a Pick Your Team or Pick Division board once its main board is selling well or sold out.
 * Only the per-division price is asked for; the 8 divisions themselves are fixed.
 */
export function AddDivisionalSupplyModal({
  open,
  parentTitle,
  defaultPriceUsd,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Title of the active board the new division spots feed into. */
  parentTitle: string;
  /** Pre-fills the price field with the board's existing per-team / per-division price. */
  defaultPriceUsd?: number | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (priceUsd: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const [priceUsd, setPriceUsd] = useState('');

  useEffect(() => {
    if (open) {
      setPriceUsd(
        typeof defaultPriceUsd === 'number' && Number.isFinite(defaultPriceUsd) && defaultPriceUsd > 0
          ? String(defaultPriceUsd)
          : '',
      );
    }
  }, [open, defaultPriceUsd]);

  const save = () => {
    const price = Number(priceUsd);
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert('Add Divisional Supply', 'Enter a valid price per division.');
      return;
    }
    onSubmit(price);
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={() => Keyboard.dismiss()} accessibilityLabel="Dismiss keyboard" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) + keyboardInset }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.handle} />
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close add Divisional Supply">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>Add Divisional Supply</Text>
            <Text style={styles.sub} numberOfLines={2}>
              8 more spots on {parentTitle}
            </Text>
            <Text style={styles.hint}>
              Adds one spot for each of the 8 real NFL divisions to this same board. Buyers see them
              immediately, right alongside the original spots.
            </Text>

            <Text style={styles.fieldLbl}>Price / division</Text>
            <TextInput
              value={priceUsd}
              onChangeText={setPriceUsd}
              placeholder="25"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              editable={!busy}
              style={[styles.input, busy && styles.inputOff]}
            />

            <Text style={styles.fieldLbl}>Adds</Text>
            <View style={[styles.input, styles.inputStatic]}>
              <Text style={styles.inputStaticTxt}>8 spots — one per NFL division</Text>
            </View>

            <Pressable style={[styles.primary, busy && styles.primaryOff]} onPress={save} disabled={busy}>
              <Text style={styles.primaryTxt}>{busy ? 'Adding…' : 'Add Divisional Supply'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: '#0c0c0e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(203,163,92,0.3)',
    maxHeight: Platform.OS === 'ios' ? '88%' : '92%',
  },
  sheetHeader: { alignItems: 'center', paddingTop: spacing.sm },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.xs,
  },
  closeBtn: { position: 'absolute', right: spacing.md, top: spacing.sm, padding: 4 },
  scrollContent: { padding: spacing.md, paddingTop: spacing.xs, gap: spacing.sm },
  title: { fontSize: 18, fontWeight: '900', color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textMuted },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  fieldLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(203,163,92,0.25)',
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  inputOff: { opacity: 0.55 },
  inputStatic: { justifyContent: 'center', opacity: 0.7 },
  inputStaticTxt: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  primary: {
    marginTop: spacing.sm,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: vaultColors.gold,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryOff: { opacity: 0.55 },
  primaryTxt: { fontWeight: '900', color: '#0a0a0a', fontSize: 15 },
});
