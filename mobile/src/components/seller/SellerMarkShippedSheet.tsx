import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radii, spacing } from '../../theme';

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  initialTrackingNumber?: string | null;
  confirmBusy?: boolean;
  onClose: () => void;
  onConfirm: (trackingNumber: string | null) => void;
};

/**
 * Self-ship confirmation sheet — for sellers shipping on their own (no Get Vaulted /
 * Shippo label). Lets them mark the order shipped and optionally record their own
 * tracking number.
 */
export function SellerMarkShippedSheet({
  visible,
  title = 'Ship it yourself',
  subtitle = "Confirms you've shipped this order with your own carrier. Add a tracking number so the buyer can follow it.",
  initialTrackingNumber,
  confirmBusy,
  onClose,
  onConfirm,
}: Props) {
  const [tracking, setTracking] = useState(initialTrackingNumber ?? '');

  useEffect(() => {
    if (visible) setTracking(initialTrackingNumber ?? '');
  }, [visible, initialTrackingNumber]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={{ gap: 4 }}>
            <Text style={styles.fieldLabel}>Tracking number (optional)</Text>
            <TextInput
              style={styles.input}
              value={tracking}
              onChangeText={setTracking}
              placeholder="e.g. 1Z999AA10123456784"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <Pressable
            style={[styles.confirm, confirmBusy && styles.confirmDisabled]}
            disabled={Boolean(confirmBusy)}
            onPress={() => onConfirm(tracking.trim() || null)}
          >
            {confirmBusy ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text style={styles.confirmTxt}>Mark as shipped</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#0e0e12',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  close: { color: colors.gold, fontSize: 14, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  fieldLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    backgroundColor: colors.surfaceElevated,
  },
  confirm: {
    marginTop: spacing.xs,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDisabled: { opacity: 0.45 },
  confirmTxt: { color: '#0a0a0a', fontSize: 14, fontWeight: '800' },
});
