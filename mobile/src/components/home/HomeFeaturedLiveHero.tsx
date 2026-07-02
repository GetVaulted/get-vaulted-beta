import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { VaultImage } from '../ui/VaultImage';
import { LiveBadge } from '../ui/LiveBadge';
import { colors, radii, spacing } from '../../theme';
import type { LiveStream, ScheduledStream } from '../../types';

function formatCountdown(iso: string): string | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = t - Date.now();
  if (diff <= 0) return 'Starting soon';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return null;
  if (h > 0) return `Starts in ${h}h ${m}m`;
  return `Starts in ${m}m`;
}

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k watching`;
  return `${n} watching`;
}

const HERO_W = Dimensions.get('window').width - spacing.lg * 2;
const HERO_H = 212;

export function HomeFeaturedLiveHero({
  liveStream,
  upcomingEvent,
  onPressLive,
  onPressUpcoming,
  onPressRemind,
  onPressExplore,
  reminderSet = false,
}: {
  liveStream: LiveStream | null;
  upcomingEvent: ScheduledStream | null;
  onPressLive: () => void;
  onPressUpcoming: () => void;
  onPressRemind?: () => void;
  onPressExplore: () => void;
  reminderSet?: boolean;
}) {
  if (liveStream) {
    return (
      <Pressable
        onPress={onPressLive}
        style={({ pressed }) => [styles.shell, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Featured live: ${liveStream.title}`}
      >
        <VaultImage
          uri={liveStream.previewImageUrl}
          width={HERO_W}
          height={HERO_H}
          priority="high"
          contentFit="cover"
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
          locations={[0, 0.35, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.inner}>
          <View style={styles.topMeta}>
            <LiveBadge compact />
            <Text style={styles.viewerTxt}>{formatViewers(liveStream.viewers)}</Text>
          </View>
          <Text style={styles.kicker}>Featured live</Text>
          <Text style={styles.title} numberOfLines={2}>
            {liveStream.title}
          </Text>
          <Text style={styles.host} numberOfLines={1}>
            {liveStream.host.name} · {streamCategoryLine(liveStream)}
          </Text>
          <View style={styles.cta}>
            <Text style={styles.ctaTxt}>Join the room</Text>
            <Ionicons name="arrow-forward" size={16} color="#0a0a0a" />
          </View>
        </View>
      </Pressable>
    );
  }

  if (upcomingEvent) {
    const countdown = formatCountdown(upcomingEvent.startsAt);
    if (countdown) {
      return (
        <Pressable
          onPress={onPressUpcoming}
          style={({ pressed }) => [styles.shell, styles.upcomingShell, pressed && styles.pressed]}
        >
          <LinearGradient colors={upcomingEvent.cardGradient} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.88)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.inner}>
            <Text style={styles.kicker}>{upcomingEvent.eventTag || 'Upcoming vault event'}</Text>
            <Text style={styles.countdown}>{countdown}</Text>
            <Text style={styles.title} numberOfLines={2}>
              {upcomingEvent.title}
            </Text>
            <Text style={styles.host} numberOfLines={1}>
              {upcomingEvent.host.name} · {upcomingEvent.interestedCount} interested
            </Text>
            <Pressable
              style={[styles.cta, styles.ctaSecondary, reminderSet && styles.ctaReminderSet]}
              onPress={(e) => {
                e.stopPropagation?.();
                onPressRemind?.();
              }}
              disabled={!onPressRemind}
              accessibilityRole="button"
              accessibilityLabel={reminderSet ? 'Reminder set for this event' : 'Set reminder for this event'}
            >
              <Text style={[styles.ctaTxt, styles.ctaTxtSecondary]}>
                {reminderSet ? 'Reminder set' : 'Set reminder'}
              </Text>
              <Ionicons
                name={reminderSet ? 'notifications' : 'notifications-outline'}
                size={16}
                color={colors.gold}
              />
            </Pressable>
          </View>
        </Pressable>
      );
    }
  }

  return (
    <Pressable
      onPress={onPressExplore}
      style={({ pressed }) => [styles.shell, styles.fallbackShell, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={['rgba(212,175,55,0.12)', 'rgba(8,8,10,0.98)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>
        <Ionicons name="shield-checkmark" size={28} color={colors.gold} style={{ marginBottom: spacing.sm }} />
        <Text style={styles.kicker}>Vault verified drops</Text>
        <Text style={styles.title}>Collector heat is building</Text>
        <Text style={styles.host}>Explore live rooms and marketplace grails.</Text>
        <View style={[styles.cta, styles.ctaSecondary]}>
          <Text style={[styles.ctaTxt, styles.ctaTxtSecondary]}>Explore live</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.gold} />
        </View>
      </View>
    </Pressable>
  );
}

function streamCategoryLine(stream: LiveStream) {
  return stream.categoryTags.slice(0, 2).join(' · ') || 'Live';
}

const styles = StyleSheet.create({
  shell: {
    height: HERO_H,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  upcomingShell: {
    borderColor: 'rgba(212,175,55,0.28)',
  },
  fallbackShell: {
    height: 168,
    borderColor: 'rgba(212,175,55,0.22)',
  },
  pressed: { opacity: 0.94 },
  inner: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  topMeta: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewerTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  countdown: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    marginTop: 4,
  },
  host: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 6,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  ctaSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
  },
  ctaReminderSet: {
    borderColor: 'rgba(212,175,55,0.75)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  ctaTxt: { fontSize: 13, fontWeight: '800', color: '#0a0a0a' },
  ctaTxtSecondary: { color: colors.gold },
});
