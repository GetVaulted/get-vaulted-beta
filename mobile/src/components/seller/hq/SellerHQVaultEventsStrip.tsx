import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../../theme';

/** Studio-only awareness strip — routes to Vault Events, not the command center. */
export function SellerHQVaultEventsStrip({
  liveCount,
  upcomingCount,
  onOpenVaultEvents,
}: {
  liveCount: number;
  upcomingCount: number;
  onOpenVaultEvents: () => void;
}) {
  if (liveCount === 0 && upcomingCount === 0) return null;

  const parts: string[] = [];
  if (liveCount > 0) parts.push(`${liveCount} live`);
  if (upcomingCount > 0) parts.push(`${upcomingCount} upcoming`);

  return (
    <Pressable
      style={({ pressed }) => [styles.shell, pressed && { opacity: 0.92 }]}
      onPress={onOpenVaultEvents}
      accessibilityRole="button"
      accessibilityLabel="Open Vault Events to manage shows"
    >
      <View style={styles.iconWrap}>
        <Ionicons name={liveCount > 0 ? 'radio' : 'calendar-outline'} size={18} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Vault Events</Text>
        <Text style={styles.sub}>
          {parts.join(' · ')} — manage shows, schedules, and command centers here
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.28)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: 'rgba(212,175,55,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
});
