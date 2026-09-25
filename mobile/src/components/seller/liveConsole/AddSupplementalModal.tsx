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
import { colors, radii, spacing } from '../../../theme';

export type SupplementalPayload = {
  name: string;
  priceUsd: number;
  spotCount: number;
};

export function AddSupplementalModal({
  open,
  parentTitle,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Title of the active item the new spots feed into. */
  parentTitle: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (payload: SupplementalPayload) => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const [name, setName] = useState('');
  const [priceUsd, setPriceUsd] = useState('');
  const [spotCount, setSpotCount] = useState('1');

  useEffect(() => {
    if (open) {
      setName('');
      setPriceUsd('');
      setSpotCount('1');
    }
  }, [open]);

  const save = () => {
    const trimmed = name.trim();
    const price = Number(priceUsd);
    const spots = Math.floor(Number(spotCount));
    if (!trimmed) {
      Alert.alert('Add supplemental', 'Enter a supplemental name.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert('Add supplemental', 'Enter a valid price per spot.');
      return;
    }
    if (!Number.isFinite(spots) || spots < 1 || spots > 64) {
      Alert.alert('Add supplemental', 'Spot count must be between 1 and 64.');
      return;
    }
    onSubmit({ name: trimmed, priceUsd: price, spotCount: spots });
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={() => Keyboard.dismiss()} accessibilityLabel="Dismiss keyboard" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) + keyboardInset }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.handle} />
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close add supplemental">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>Add supplemental</Text>
            <Text style={styles.sub} numberOfLines={2}>
              New spots on {parentTitle}
            </Text>
            <Text style={styles.hint}>
              Spots are added to the active board — buyers see them immediately on the same lot.
            </Text>

            <Text style={styles.fieldLbl}>Supplemental name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Extra random"
              placeholderTextColor={colors.textMuted}
              editable={!busy}
              style={[styles.input, busy && styles.inputOff]}
            />

            <Text style={styles.fieldLbl}>Price / spot</Text>
            <TextInput
              value={priceUsd}
              onChangeText={setPriceUsd}
              placeholder="25"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              editable={!busy}
              style={[styles.input, busy && styles.inputOff]}
            />

            <Text style={styles.fieldLbl}># of spots</Text>
            <TextInput
              value={spotCount}
              onChangeText={setSpotCount}
              placeholder="1"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              editable={!busy}
              style={[styles.input, busy && styles.inputOff]}
            />

            <Pressable style={[styles.primary, busy && styles.primaryOff]} onPress={save} disabled={busy}>
              <Text style={styles.primaryTxt}>{busy ? 'Adding…' : 'Add supplemental'}</Text>
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
    borderColor: 'rgba(212,175,55,0.3)',
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
    borderColor: 'rgba(212,175,55,0.25)',
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  inputOff: { opacity: 0.55 },
  primary: {
    marginTop: spacing.sm,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryOff: { opacity: 0.55 },
  primaryTxt: { fontWeight: '900', color: '#0a0a0a', fontSize: 15 },
});
