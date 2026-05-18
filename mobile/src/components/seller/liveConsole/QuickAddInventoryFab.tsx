import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../../../theme';

export type QuickAddAction = 'marketplace' | 'quick_lot' | 'scan' | 'inventory';

const OPTIONS: { id: QuickAddAction; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'marketplace', label: 'Marketplace item', sub: 'List to collector network', icon: 'storefront-outline' },
  { id: 'quick_lot', label: 'Quick live lot', sub: 'Title-only queue lot', icon: 'flash-outline' },
  { id: 'inventory', label: 'From inventory', sub: 'Pull from your listings', icon: 'layers-outline' },
  { id: 'scan', label: 'Scan card', sub: 'Coming to your lane', icon: 'scan-outline' },
];

export function QuickAddInventoryFab({
  onAction,
  bottomOffset = 24,
}: {
  onAction: (id: QuickAddAction) => void;
  bottomOffset?: number;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.root, { bottom: insets.bottom + bottomOffset }]} pointerEvents="box-none">
      {open ? (
        <View style={styles.menu}>
          {OPTIONS.map((o) => (
            <Pressable
              key={o.id}
              style={styles.menuRow}
              onPress={() => {
                setOpen(false);
                onAction(o.id);
              }}
            >
              <Ionicons name={o.icon} size={20} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLbl}>{o.label}</Text>
                <Text style={styles.menuSub}>{o.sub}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable
        style={styles.fab}
        onPress={() => setOpen((v) => !v)}
        accessibilityLabel={open ? 'Close quick add' : 'Quick add inventory'}
      >
        <LinearGradient colors={['#F0D56A', colors.gold, '#9A7B2C']} style={StyleSheet.absoluteFill} />
        <Ionicons name={open ? 'close' : 'add'} size={26} color="#0a0a0a" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', right: spacing.md, alignItems: 'flex-end', zIndex: 50 },
  menu: {
    marginBottom: spacing.sm,
    minWidth: 220,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(10,10,12,0.96)',
    paddingVertical: spacing.xs,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  menuLbl: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  menuSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D4AF37',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
});
