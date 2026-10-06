import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MARKETPLACE_SORTS, type MarketplaceSortValue } from '../../lib/marketplaceSort';
import { colors, radii, spacing } from '../../theme';

export function MarketplaceSortSheet({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: MarketplaceSortValue;
  onSelect: (value: MarketplaceSortValue) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close sort options">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.heading}>Sort by</Text>
          {MARKETPLACE_SORTS.map((opt) => {
            const on = opt.value === value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  onSelect(opt.value);
                  onClose();
                }}
                style={styles.row}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.label, on && styles.labelOn]}>{opt.label}</Text>
                {on ? <Ionicons name="checkmark" size={18} color={colors.gold} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  heading: { fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: colors.textSecondary, marginBottom: spacing.sm },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  labelOn: { color: colors.gold, fontWeight: '800' },
});
