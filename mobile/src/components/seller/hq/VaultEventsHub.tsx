import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMyLiveRooms, type LiveRoomApiRow } from '../../../api/liveRoomsRepository';
import type { LiveSalesGate } from '../../../lib/sellerLiveReadiness';
import { bucketRooms, primaryCta, type VaultEventDisplayStatus, type VaultEventSection } from '../../../lib/vaultEventModel';
import { colors, radii, spacing } from '../../../theme';
import { VaultEventCard } from './VaultEventCard';

const SEGMENTS: { id: VaultEventSection; label: string }[] = [
  { id: 'live_now', label: 'Live now' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'past', label: 'Past' },
];

const EMPTY_COPY: Record<VaultEventSection, { title: string; body: string }> = {
  live_now: {
    title: 'Nothing live',
    body: 'When a show is on air, it appears here with viewer count and a direct link to its command center.',
  },
  upcoming: {
    title: 'No upcoming shows',
    body: 'Schedule a vault event to set the date, build hype, and enter the command center when you are ready.',
  },
  drafts: {
    title: 'No drafts',
    body: 'Incomplete events land here — finish title, schedule, and inventory before you go on air.',
  },
  past: {
    title: 'No past events',
    body: 'Ended shows and recaps will collect here for analytics and collector replay.',
  },
};

export function VaultEventsHub({
  accessToken,
  liveGate,
  sellerAvatarUrl,
  onHostRoom,
  onViewRecap,
  onScheduleNew,
  onBlockedSchedule,
  roomsRefreshKey = 0,
}: {
  accessToken?: string;
  liveGate: LiveSalesGate;
  sellerAvatarUrl?: string | null;
  onHostRoom: (roomId: string) => void;
  onViewRecap: (roomId: string) => void;
  onScheduleNew: () => void;
  onBlockedSchedule?: () => void;
  roomsRefreshKey?: number;
}) {
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<VaultEventSection>('live_now');
  const [rooms, setRooms] = useState<LiveRoomApiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const liveBlocked = liveGate.blocked;

  const trySchedule = useCallback(() => {
    if (liveBlocked) {
      onBlockedSchedule?.();
      return;
    }
    onScheduleNew();
  }, [liveBlocked, onBlockedSchedule, onScheduleNew]);

  const load = useCallback(async () => {
    if (!accessToken) {
      setRooms([]);
      return;
    }
    setLoading(true);
    try {
      setRooms(await fetchMyLiveRooms(accessToken));
    } catch {
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load, roomsRefreshKey]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const buckets = useMemo(() => bucketRooms(rooms), [rooms]);
  const list = buckets[segment];
  const counts = useMemo(
    () => ({
      live_now: buckets.live_now.length,
      upcoming: buckets.upcoming.length,
      drafts: buckets.drafts.length,
      past: buckets.past.length,
    }),
    [buckets],
  );

  const onCardAction = useCallback(
    (room: LiveRoomApiRow, displayStatus: VaultEventDisplayStatus) => {
      const cta = primaryCta(displayStatus);
      if (cta.action === 'recap') onViewRecap(room.id);
      else onHostRoom(room.id);
    },
    [onHostRoom, onViewRecap],
  );

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.gold} />}
        contentContainerStyle={styles.scroll}
      >
        <Text style={styles.eyebrow}>Event management</Text>
        <Text style={styles.title}>Vault Events</Text>
        <Text style={styles.sub}>
          Show manager — tap an event to open its command center (livestream, queue, moderation). Seller Studio
          handles business ops; this tab handles shows.
        </Text>

        {liveBlocked && liveGate.bannerMessage ? (
          <View style={styles.blockBanner}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.gold} />
            <Text style={styles.blockTxt}>{liveGate.bannerMessage}</Text>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentRow}>
          {SEGMENTS.map((seg) => {
            const on = segment === seg.id;
            const n = counts[seg.id];
            return (
              <Pressable
                key={seg.id}
                onPress={() => setSegment(seg.id)}
                style={[styles.segment, on && styles.segmentOn]}
              >
                <Text style={[styles.segmentTxt, on && styles.segmentTxtOn]}>{seg.label}</Text>
                {n > 0 ? (
                  <View style={[styles.segmentBadge, on && styles.segmentBadgeOn]}>
                    <Text style={[styles.segmentBadgeTxt, on && styles.segmentBadgeTxtOn]}>{n}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        {loading && list.length === 0 ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>{EMPTY_COPY[segment].title}</Text>
            <Text style={styles.emptyBody}>{EMPTY_COPY[segment].body}</Text>
            {segment !== 'past' ? (
              <Pressable style={styles.emptyCta} onPress={trySchedule} disabled={liveBlocked}>
                <Text style={styles.emptyCtaTxt}>Schedule vault event</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.list}>
            {list.map(({ room, displayStatus }) => (
              <VaultEventCard
                key={room.id}
                room={room}
                displayStatus={displayStatus}
                sellerAvatarUrl={sellerAvatarUrl}
                onPress={() => onCardAction(room, displayStatus)}
                onPrimaryAction={() => onCardAction(room, displayStatus)}
              />
            ))}
          </View>
        )}
        <View style={{ height: 88 }} />
      </ScrollView>

      <Pressable
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 8 }]}
        onPress={trySchedule}
        disabled={liveBlocked}
        accessibilityRole="button"
        accessibilityLabel="Schedule vault event"
      >
        <LinearGradient colors={['#F0D56A', colors.gold, '#9A7B2C']} style={StyleSheet.absoluteFill} />
        <Ionicons name="add" size={22} color="#0a0a0a" />
        <Text style={styles.fabTxt}>Schedule Vault Event</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 320 },
  scroll: { paddingBottom: spacing.md },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.4,
    marginTop: 4,
  },
  sub: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  blockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  blockTxt: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  segmentRow: { gap: spacing.sm, paddingBottom: spacing.md },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  segmentOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  segmentTxt: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  segmentTxtOn: { color: colors.textPrimary },
  segmentBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  segmentBadgeOn: { backgroundColor: 'rgba(0,0,0,0.35)' },
  segmentBadgeTxt: { fontSize: 10, fontWeight: '900', color: colors.textMuted },
  segmentBadgeTxtOn: { color: colors.gold },
  list: { gap: 0 },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  emptyCta: {
    marginTop: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  emptyCtaTxt: { fontSize: 14, fontWeight: '800', color: colors.gold },
  fab: {
    position: 'absolute',
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    overflow: 'hidden',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  fabTxt: { fontSize: 14, fontWeight: '900', color: '#0a0a0a' },
});
