import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../../../theme';

export type FabActionId = 'vault_events' | 'listing' | 'schedule' | 'inventory';

const ACTIONS: { id: FabActionId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'vault_events', label: 'Vault Events', icon: 'albums-outline' },
  { id: 'listing', label: 'Create Listing', icon: 'add-circle-outline' },
  { id: 'schedule', label: 'Schedule Event', icon: 'calendar' },
  { id: 'inventory', label: 'Inventory', icon: 'layers-outline' },
];

export function SellerHQFab({ onAction }: { onAction: (id: FabActionId) => void }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.root, { bottom: Math.max(insets.bottom, 16) + 56 }]} pointerEvents="box-none">
      {open ? (
        <View style={styles.menu}>
          {ACTIONS.map((a) => (
            <Pressable
              key={a.id}
              style={styles.menuRow}
              onPress={() => {
                setOpen(false);
                onAction(a.id);
              }}
            >
              <View style={styles.menuIcon}>
                <Ionicons name={a.icon} size={20} color={colors.gold} />
              </View>
              <Text style={styles.menuLbl}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable
        style={styles.fab}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Close quick actions' : 'Seller quick actions'}
      >
        <LinearGradient colors={['#F0D56A', colors.gold, '#9A7B2C']} style={StyleSheet.absoluteFill} />
        <Ionicons name={open ? 'close' : 'add'} size={28} color="#0a0a0a" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    right: spacing.lg,
    alignItems: 'flex-end',
    zIndex: 100,
  },
  menu: {
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(12,11,9,0.96)',
    paddingVertical: spacing.xs,
    minWidth: 200,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: 'rgba(212,175,55,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLbl: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 12,
  },
});
