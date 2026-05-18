import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing } from '../../../theme';

export type AddInventoryChoice = 'marketplace' | 'live_show' | 'quick_lot' | 'scan';

const OPTIONS: {
  id: AddInventoryChoice;
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'live_show', title: 'From inventory', sub: 'Pull a live-show listing', icon: 'layers-outline' },
  { id: 'marketplace', title: 'Marketplace item', sub: 'Add to collector network', icon: 'storefront-outline' },
  { id: 'quick_lot', title: 'Quick live lot', sub: 'Title-only lane card', icon: 'flash-outline' },
];

export function AddInventoryModal({
  visible,
  quickTitle,
  onChangeQuickTitle,
  onClose,
  onSelect,
}: {
  visible: boolean;
  quickTitle: string;
  onChangeQuickTitle: (s: string) => void;
  onClose: () => void;
  onSelect: (id: AddInventoryChoice) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Add inventory</Text>
          <Text style={styles.sub}>Queue lots without leaving the lane.</Text>
          {OPTIONS.map((o) => (
            <Pressable key={o.id} style={styles.row} onPress={() => onSelect(o.id)}>
              <View style={styles.iconBubble}>
                <Ionicons name={o.icon} size={20} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{o.title}</Text>
                <Text style={styles.rowSub}>{o.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
          <Text style={styles.quickLbl}>Quick lot title</Text>
          <TextInput
            value={quickTitle}
            onChangeText={onChangeQuickTitle}
            placeholder="e.g. PSA 10 rookie chase"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Pressable style={styles.primary} onPress={() => onSelect('quick_lot')}>
            <Text style={styles.primaryTxt}>Add quick lot to queue</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0c0c0e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    padding: spacing.md,
    paddingBottom: spacing.xl,
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
  sub: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: 'rgba(212,175,55,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  rowSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  quickLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    borderRadius: radii.md,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  primary: {
    marginTop: spacing.sm,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  primaryTxt: { fontWeight: '900', color: '#0a0a0a', fontSize: 15 },
});
