import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { UserAvatar } from '../ui/UserAvatar';
import { VaultImage } from '../ui/VaultImage';
import { LiveBadge } from '../ui/LiveBadge';
import { liveRoomCategoryLine } from '../../lib/liveRoomDisplay';
import { resolveLiveRoomPreviewImage } from '../../lib/liveRoomPreviewImage';
import { colors, radii, spacing } from '../../theme';
import type { LiveStream, ScheduledStream } from '../../types';

const SCREEN_W = Dimensions.get('window').width;
const CARD_W = Math.min(SCREEN_W - spacing.lg * 2, 360);
const CARD_H = Math.round(CARD_W * 1.18);
const CARD_GAP = spacing.md;
const CARD_SNAP = CARD_W + CARD_GAP;

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k watching`;
  return `${n} watching`;
}

function formatCountdown(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Scheduled';
  const diff = t - Date.now();
  if (diff <= 0) return 'Starting soon';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  if (h > 0) return `Starts in ${h}h ${m}m`;
  return `Starts in ${m}m`;
}

function LivePulseDot() {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.pulseDot, { opacity: pulse }]}>
      <View style={styles.pulseCore} />
    </Animated.View>
  );
}

function LiveHeroCard({ stream, onPress }: { stream: LiveStream; onPress: () => void }) {
  const preview =
    stream.previewImageUrl?.trim() ||
    stream.pinnedItemImageUrl?.trim() ||
    resolveLiveRoomPreviewImage({ category: stream.category });
  const itemPreview = stream.pinnedProductLabel?.trim() || stream.currentItem?.trim();
  const category = liveRoomCategoryLine(stream);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardShell, { width: CARD_W, height: CARD_H }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Watch live: ${stream.title}`}
    >
      <VaultImage uri={preview} width={CARD_W} height={CARD_H} priority="high" contentFit="cover" style={StyleSheet.absoluteFillObject} />
      <LinearGradient colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.94)']} locations={[0, 0.42, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.cardInner}>
        <View style={styles.topRow}>
          <View style={styles.liveRow}>
            <LivePulseDot />
            <LiveBadge compact />
          </View>
          <Text style={styles.viewers}>{formatViewers(stream.viewers)}</Text>
        </View>
        <View style={styles.hostRow}>
          <UserAvatar uri={stream.host.avatarUrl} name={stream.host.name} username={stream.host.handle} size={34} tone="light" borderWidth={1} />
          <View style={{ flex: 1 }}>
            <Text style={styles.hostName} numberOfLines={1}>{stream.host.name}</Text>
            <Text style={styles.hostMeta} numberOfLines={1}>{category}</Text>
          </View>
        </View>
        <Text style={styles.heroTitle} numberOfLines={2}>{stream.title}</Text>
        {itemPreview ? (
          <View style={styles.itemChip}>
            <Ionicons name="flash" size={12} color={colors.gold} />
            <Text style={styles.itemChipTxt} numberOfLines={1}>{itemPreview}</Text>
          </View>
        ) : null}
        {stream.heatLabel ? <Text style={styles.heatLabel}>{stream.heatLabel}</Text> : null}
        <View style={styles.cta}>
          <Text style={styles.ctaTxt}>Watch Live</Text>
          <Ionicons name="arrow-forward" size={16} color="#0a0a0a" />
        </View>
      </View>
    </Pressable>
  );
}

function UpcomingHeroCard({
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

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardShell, styles.upcomingShell, { width: CARD_W, height: CARD_H }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Upcoming show: ${event.title}`}
    >
      <LinearGradient colors={event.cardGradient} style={StyleSheet.absoluteFill} />
      {preview ? (
        <VaultImage uri={preview} width={CARD_W} height={CARD_H} priority="high" contentFit="cover" style={[StyleSheet.absoluteFillObject, { opacity: 0.42 }]} />
      ) : null}
      <LinearGradient colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.88)']} style={StyleSheet.absoluteFill} />
      <View style={styles.cardInner}>
        <Text style={styles.upcomingEyebrow}>Tonight on Get Vaulted</Text>
        <Text style={styles.countdown}>{formatCountdown(event.startsAt)}</Text>
        <Text style={styles.heroTitle} numberOfLines={2}>{event.title}</Text>
        <View style={styles.hostRow}>
          <UserAvatar uri={event.host.avatarUrl} name={event.host.name} username={event.host.handle} size={30} tone="light" />
          <Text style={styles.hostName} numberOfLines={1}>{event.host.name}</Text>
        </View>
        <Pressable
          style={[styles.cta, styles.ctaGhost, reminderSet && styles.ctaGhostSet]}
          onPress={(e) => {
            e.stopPropagation?.();
            onRemind();
          }}
          accessibilityRole="button"
          accessibilityLabel={reminderSet ? 'Reminder set' : 'Remind me'}
        >
          <Ionicons name={reminderSet ? 'notifications' : 'notifications-outline'} size={16} color={colors.gold} />
          <Text style={[styles.ctaTxt, styles.ctaTxtGhost]}>{reminderSet ? 'Reminder set' : 'Remind Me'}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function FallbackHeroCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardShell, styles.fallbackShell, { width: CARD_W, height: CARD_H - 40 }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Explore the live floor"
    >
      <LinearGradient colors={['rgba(255,59,48,0.14)', '#0a0a0c', '#050505']} style={StyleSheet.absoluteFill} />
      <View style={styles.cardInner}>
        <Ionicons name="radio" size={28} color={colors.live} />
        <Text style={styles.upcomingEyebrow}>Live floor</Text>
        <Text style={styles.heroTitle}>The vault is warming up</Text>
        <Text style={styles.hostMeta}>Breaks, auctions, and drops go live here. Jump in when rooms open.</Text>
        <View style={[styles.cta, styles.ctaLive]}>
          <Text style={styles.ctaTxt}>Explore Live</Text>
          <Ionicons name="arrow-forward" size={16} color="#0a0a0a" />
        </View>
      </View>
    </Pressable>
  );
}

export function HomeLiveHeroCarousel({
  liveStreams,
  upcomingEvents,
  loading,
  reminderSetFor,
  onWatchLive,
  onOpenUpcoming,
  onRemindUpcoming,
  onExploreLive,
}: {
  liveStreams: LiveStream[];
  upcomingEvents: ScheduledStream[];
  loading: boolean;
  reminderSetFor: (id: string) => boolean;
  onWatchLive: (streamId: string) => void;
  onOpenUpcoming: (eventId: string) => void;
  onRemindUpcoming: (event: ScheduledStream) => void;
  onExploreLive: () => void;
}) {
  if (loading) {
    return (
      <View style={[styles.skeleton, { width: CARD_W, height: CARD_H }]}>
        <LinearGradient colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
      </View>
    );
  }

  if (liveStreams.length > 0) {
    return (
      <FlatList
        horizontal
        data={liveStreams}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_SNAP}
        decelerationRate="fast"
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <LiveHeroCard stream={item} onPress={() => onWatchLive(item.id)} />
        )}
      />
    );
  }

  if (upcomingEvents.length > 0) {
    return (
      <FlatList
        horizontal
        data={upcomingEvents}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_SNAP}
        decelerationRate="fast"
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <UpcomingHeroCard
            event={item}
            reminderSet={reminderSetFor(item.id)}
            onPress={() => onOpenUpcoming(item.id)}
            onRemind={() => onRemindUpcoming(item)}
          />
        )}
      />
    );
  }

  return <FallbackHeroCard onPress={onExploreLive} />;
}

const styles = StyleSheet.create({
  list: {
    paddingRight: spacing.lg,
    gap: CARD_GAP,
  },
  cardShell: {
    borderRadius: radii.lg + 4,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  upcomingShell: {
    borderColor: 'rgba(212,175,55,0.28)',
  },
  fallbackShell: {
    borderColor: 'rgba(255,59,48,0.25)',
  },
  pressed: { opacity: 0.94 },
  skeleton: {
    borderRadius: radii.lg + 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cardInner: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  topRow: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,59,48,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.live,
  },
  viewers: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hostName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  hostMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 17,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  itemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  itemChipTxt: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.gold,
  },
  heatLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    color: colors.live,
    textTransform: 'uppercase',
  },
  upcomingEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(212,175,55,0.8)',
  },
  countdown: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.xs,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  ctaLive: {
    backgroundColor: colors.live,
  },
  ctaGhost: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
  },
  ctaGhostSet: {
    borderColor: 'rgba(212,175,55,0.75)',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  ctaTxt: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0a0a0a',
  },
  ctaTxtGhost: {
    color: colors.gold,
  },
});
