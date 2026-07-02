import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { UserAvatar } from '../ui/UserAvatar';
import { VaultImage } from '../ui/VaultImage';
import { categoryMeta } from '../../data/categoryTaxonomy';
import { colors, radii, spacing } from '../../theme';
import type { ScheduledStream } from '../../types';

export const STARTING_SOON_CARD_W = 156;
export const STARTING_SOON_CARD_GAP = spacing.sm;
export const STARTING_SOON_SNAP = STARTING_SOON_CARD_W + STARTING_SOON_CARD_GAP;

function formatCountdown(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Scheduled';
  const diff = t - Date.now();
  if (diff <= 0) return 'Starting soon';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  if (h > 0) return `Starts in ${h}h ${m}m`;
  return `Starts in ${m}m`;
}

function StartingSoonCard({
  event,
  reminderSet,
  onPress,
  onRemind,
}: {
  event: ScheduledStream;
  reminderSet: boolean;
  onPress: () => void;
  onRemind: () => void;
}) {
  const preview = event.previewImageUrl?.trim() || event.host.avatarUrl?.trim();
  const category = categoryMeta[event.category].label;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${formatCountdown(event.startsAt)}`}
    >
      <View style={styles.imageWrap}>
        {preview ? (
          <VaultImage uri={preview} width={STARTING_SOON_CARD_W} height={112} contentFit="cover" style={StyleSheet.absoluteFillObject} />
        ) : (
          <LinearGradient colors={event.cardGradient} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.imageFade} />
        <Text style={styles.countdown}>{formatCountdown(event.startsAt)}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.category}>{category}</Text>
        <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
        <View style={styles.hostRow}>
          <UserAvatar uri={event.host.avatarUrl} name={event.host.name} username={event.host.handle} size={22} tone="light" />
          <Text style={styles.host} numberOfLines={1}>{event.host.name}</Text>
        </View>
        {event.interestedCount > 0 ? (
          <Text style={styles.interested}>{event.interestedCount} interested</Text>
        ) : null}
        <Pressable
          style={[styles.remindBtn, reminderSet && styles.remindBtnSet]}
          onPress={(e) => {
            e.stopPropagation?.();
            onRemind();
          }}
          accessibilityRole="button"
          accessibilityLabel={reminderSet ? 'Reminder set' : 'Set reminder'}
        >
          <Ionicons name={reminderSet ? 'notifications' : 'notifications-outline'} size={14} color={colors.gold} />
          <Text style={styles.remindTxt}>{reminderSet ? 'Reminder set' : 'Set Reminder'}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export function HomeStartingSoonLane({
  events,
  reminderSetFor,
  onOpenEvent,
  onRemind,
}: {
  events: ScheduledStream[];
  reminderSetFor: (id: string) => boolean;
  onOpenEvent: (id: string) => void;
  onRemind: (event: ScheduledStream) => void;
}) {
  if (!events.length) return null;

  return (
    <FlatList
      horizontal
      data={events}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      snapToInterval={STARTING_SOON_SNAP}
      decelerationRate="fast"
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <StartingSoonCard
          event={item}
          reminderSet={reminderSetFor(item.id)}
          onPress={() => onOpenEvent(item.id)}
          onRemind={() => onRemind(item)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    gap: STARTING_SOON_CARD_GAP,
    paddingRight: spacing.lg,
  },
  card: {
    width: STARTING_SOON_CARD_W,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.22)',
  },
  pressed: { opacity: 0.92 },
  imageWrap: {
    height: 112,
    backgroundColor: '#111',
  },
  imageFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
  },
  countdown: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    fontSize: 11,
    fontWeight: '900',
    color: colors.live,
    letterSpacing: 0.2,
  },
  body: {
    padding: spacing.sm + 2,
    gap: 4,
  },
  category: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 17,
    minHeight: 34,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  host: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  interested: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  remindBtn: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  remindBtnSet: {
    borderColor: 'rgba(212,175,55,0.7)',
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  remindTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gold,
  },
});
