import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ScheduledStream } from '../../types';
import { colors, radii, spacing } from '../../theme';

function formatCountdown(iso: string): string | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = t - Date.now();
  if (diff <= 0) return 'Starting soon';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 48) return null;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Subtle seller-only strip — upcoming show reminder, not a public Command Center promo. */
export function HomeSellerEventBanner({
  event,
  onOpenCommandCenter,
}: {
  event: ScheduledStream | null;
  onOpenCommandCenter: () => void;
}) {
  if (!event) return null;
  const countdown = formatCountdown(event.startsAt);
  if (!countdown) return null;

  return (
    <Pressable
      onPress={onOpenCommandCenter}
      style={({ pressed }) => [styles.shell, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Open your event command center"
    >
      <Ionicons name="time-outline" size={18} color={colors.gold} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          Your event starts in {countdown}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {event.title} · Open command center
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.28)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  pressed: { opacity: 0.92 },
  title: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
