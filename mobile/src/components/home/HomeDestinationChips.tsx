import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

type Chip = {
  key: string;
  label: string;
  sublabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  onPress: () => void;
};

export function HomeDestinationChips({
  liveCount,
  listingCount,
  scheduledCount,
  onLive,
  onVault,
  onEvents,
}: {
  liveCount: number;
  listingCount: number;
  scheduledCount: number;
  onLive: () => void;
  onVault: () => void;
  onEvents: () => void;
}) {
  const chips: Chip[] = [
    {
      key: 'live',
      label: liveCount > 0 ? `${liveCount} live` : 'Live floor',
      sublabel: liveCount > 0 ? 'Streaming now' : 'Enter rooms',
      icon: 'radio',
      accent: colors.live,
      onPress: onLive,
    },
    {
      key: 'vault',
      label: listingCount > 0 ? `${listingCount} listings` : 'Vault shop',
      sublabel: listingCount > 0 ? 'Buy now & offers' : 'Browse inventory',
      icon: 'diamond-outline',
      accent: colors.gold,
      onPress: onVault,
    },
    {
      key: 'events',
      label: scheduledCount > 0 ? `${scheduledCount} drops` : 'Upcoming',
      sublabel: scheduledCount > 0 ? 'Set reminders' : 'See schedule',
      icon: 'calendar-outline',
      accent: '#8B9DC3',
      onPress: onEvents,
    },
  ];

  return (
    <View style={styles.row}>
      {chips.map((chip) => (
        <Pressable
          key={chip.key}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          onPress={chip.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${chip.label}, ${chip.sublabel}`}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${chip.accent}18` }]}>
            <Ionicons name={chip.icon} size={16} color={chip.accent} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {chip.label}
          </Text>
          <Text style={styles.sublabel} numberOfLines={1}>
            {chip.sublabel}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 4,
  },
  chipPressed: {
    opacity: 0.88,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  sublabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
