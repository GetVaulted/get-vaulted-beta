import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../../theme';

type ActionId = 'listing' | 'events' | 'fulfillment';

const ACTIONS: {
  id: ActionId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'listing', label: 'New listing', icon: 'add-circle-outline' },
  { id: 'events', label: 'Vault Events', icon: 'calendar-outline' },
  { id: 'fulfillment', label: 'Fulfillment', icon: 'cube-outline' },
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
          <Ionicons name={action.icon} size={22} color={colors.gold} />
          <Text style={styles.label}>{action.label}</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.22)',
    backgroundColor: 'rgba(212,175,55,0.05)',
  },
  pressed: { opacity: 0.9 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
