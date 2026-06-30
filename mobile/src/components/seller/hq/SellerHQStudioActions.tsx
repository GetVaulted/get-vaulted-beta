import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../../theme';

type ActionId = 'listing' | 'events' | 'fulfillment';

const ACTIONS: {
  id: ActionId;
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'listing', label: 'New listing', sub: 'Marketplace inventory', icon: 'storefront-outline' },
  { id: 'events', label: 'Vault events', sub: 'Schedule or go live', icon: 'radio-outline' },
  { id: 'fulfillment', label: 'Fulfillment', sub: 'Orders to ship', icon: 'cube-outline' },
];

export function SellerHQStudioActions({ onAction }: { onAction: (id: ActionId) => void }) {
  return (
    <View style={styles.wrap}>
      {ACTIONS.map((action) => (
        <Pressable
          key={action.id}
          style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          onPress={() => onAction(action.id)}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <View style={styles.iconRing}>
            <Ionicons name={action.icon} size={20} color={colors.gold} />
          </View>
          <Text style={styles.label}>{action.label}</Text>
          <Text style={styles.sub} numberOfLines={2}>
            {action.sub}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tile: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.surfaceElevated,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  iconRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: 'rgba(212,175,55,0.08)',
    marginBottom: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    lineHeight: 15,
  },
});
