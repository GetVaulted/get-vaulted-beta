import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { patchLiveRoomAction } from '../../../api/liveHostRepository';
import { fetchMyLiveRooms, type LiveRoomApiRow } from '../../../api/liveRoomsRepository';
import type { LiveSalesGate } from '../../../lib/sellerLiveReadiness';
import {
  bucketRooms,
  canCancelVaultEvent,
  canEditVaultEvent,
  primaryCta,
  type VaultEventBucket,
  type VaultEventDisplayStatus,
  type VaultEventSection,
  vaultEventDisplayStatus,
  vaultEventSection,
} from '../../../lib/vaultEventModel';
import { logVaultEvents } from '../../../lib/vaultEventsLayout';
import { notifyLiveDiscoveryChanged } from '../../../lib/notifyLiveDiscoveryChanged';
import { subscribeHomeFeedInvalidation } from '../../../lib/homeFeedCache';
import type { SellerReloadOptions } from '../../../hooks/sellerReloadOptions';
import { colors, radii, spacing } from '../../../theme';
import { VaultEventCard } from './VaultEventCard';
import { EditVaultEventModal } from './EditVaultEventModal';

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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [segment, setSegment] = useState<VaultEventSection>('live_now');
  const [rooms, setRooms] = useState<LiveRoomApiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [contentAreaHeight, setContentAreaHeight] = useState(0);
  const [cancellingRoomId, setCancellingRoomId] = useState<string | null>(null);
  const [editingRoom, setEditingRoom] = useState<LiveRoomApiRow | null>(null);
  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);

  const liveBlocked = liveGate.blocked;

  const trySchedule = useCallback(() => {
    onScheduleNew();
  }, [onScheduleNew]);

  const load = useCallback(async (opts?: SellerReloadOptions) => {
    if (!accessToken?.trim()) {
      setRooms([]);
      setFetchError(null);
      setLoading(false);
      setRefreshing(false);
      if (!loadedOnceRef.current) {
        setLoadedOnce(true);
        loadedOnceRef.current = true;
      }
      logVaultEvents('filter', { reason: 'no_access_token', roomCount: 0 });
      return;
    }

    const requestId = ++requestRef.current;
    const silent = opts?.silent ?? loadedOnceRef.current;
    if (!silent) setLoading(true);
    setFetchError(null);

    try {
      const rows = await fetchMyLiveRooms(accessToken, { force: opts?.force });
      if (requestId !== requestRef.current) return;
      setRooms(rows);
      setLoadedOnce(true);
      loadedOnceRef.current = true;
      logVaultEvents('filter', {
        http: 'ok',
        roomCount: rows.length,
        statuses: rows.map((r) => r.status),
        titles: rows.map((r) => r.title?.slice(0, 40)),
      });
    } catch (e) {
      if (requestId !== requestRef.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (!loadedOnceRef.current) setRooms([]);
      setFetchError(msg);
      setLoadedOnce(true);
      loadedOnceRef.current = true;
      logVaultEvents('filter', { http: 'error', error: msg.slice(0, 200), roomCount: 0 });
    } finally {
      if (requestId !== requestRef.current) return;
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load({ force: true });
  }, [load, roomsRefreshKey]);

  useFocusEffect(
    useCallback(() => {
      void load({ silent: true, force: true });
    }, [load]),
  );

  useEffect(() => {
    return subscribeHomeFeedInvalidation(() => {
      void load({ silent: true, force: true });
    });
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load({ silent: true, force: true });
    } finally {
      setRefreshing(false);
    }
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

  useEffect(() => {
    logVaultEvents('filter', {
      segment,
      segmentCount: list.length,
      counts,
      totalRooms: rooms.length,
    });
    if (rooms.length > 0 && list.length === 0) {
      const elsewhere = rooms.map((room) => ({
        id: room.id,
        apiStatus: room.status,
        displayStatus: vaultEventDisplayStatus(room),
        section: vaultEventSection(room),
        hasSchedule: Boolean(room.scheduledStartAt),
        titleLen: room.title?.trim().length ?? 0,
      }));
      logVaultEvents('filter', {
        reason: 'rooms_exist_segment_empty',
        segment,
        rooms: elsewhere,
      });
    }
  }, [segment, list.length, counts, rooms]);

  useEffect(() => {
    logVaultEvents('render', {
      segment,
      loading,
      refreshing,
      showEmpty: !loading && list.length === 0,
      showList: list.length > 0,
      listCount: list.length,
      fetchError: fetchError?.slice(0, 120) ?? null,
      contentAreaHeight,
      windowWidth,
      windowHeight,
      bottomInset: insets.bottom,
    });
  }, [
    segment,
    loading,
    refreshing,
    list.length,
    fetchError,
    contentAreaHeight,
    windowWidth,
    windowHeight,
    insets.bottom,
  ]);

  const onCardAction = useCallback(
    (room: LiveRoomApiRow, displayStatus: VaultEventDisplayStatus) => {
      const cta = primaryCta(displayStatus);
      if (cta.action === 'recap') onViewRecap(room.id);
      else onHostRoom(room.id);
    },
    [onHostRoom, onViewRecap],
  );

  const onCancelRoom = useCallback(
    (room: LiveRoomApiRow, displayStatus: VaultEventDisplayStatus) => {
      if (!accessToken?.trim() || !canCancelVaultEvent(room) || cancellingRoomId) return;

      const isLive = displayStatus === 'live';
      Alert.alert(
        isLive ? 'End this show?' : 'Cancel this show?',
        isLive
          ? 'The stream will stop and this show will be removed from Live & Upcoming.'
          : 'This show will be removed from Live & Upcoming.',
        [
          { text: 'Keep show', style: 'cancel' },
          {
            text: isLive ? 'End show' : 'Cancel show',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setCancellingRoomId(room.id);
                try {
                  await patchLiveRoomAction(accessToken, room.id, 'cancel');
                  await notifyLiveDiscoveryChanged();
                  await load({ silent: true, force: true });
                } catch (e) {
                  Alert.alert('Could not cancel show', e instanceof Error ? e.message : 'Try again.');
                } finally {
                  setCancellingRoomId(null);
                }
              })();
            },
          },
        ],
      );
    },
    [accessToken, cancellingRoomId, load],
  );

  const showLoader = loading && !loadedOnce && rooms.length === 0;
  const showEmpty = loadedOnce && !loading && list.length === 0;
  const showList = list.length > 0;

  const renderEventCard = useCallback(
    ({ item: { room, displayStatus } }: { item: VaultEventBucket }) => (
      <VaultEventCard
        room={room}
        displayStatus={displayStatus}
        sellerAvatarUrl={sellerAvatarUrl}
        onPress={() => onCardAction(room, displayStatus)}
        onPrimaryAction={() => onCardAction(room, displayStatus)}
        onCancel={
          canCancelVaultEvent(room)
            ? () => onCancelRoom(room, displayStatus)
            : undefined
        }
        onEdit={canEditVaultEvent(room) ? () => setEditingRoom(room) : undefined}
        cancelBusy={cancellingRoomId === room.id}
      />
    ),
    [cancellingRoomId, onCancelRoom, onCardAction, sellerAvatarUrl],
  );

  const listEmpty = useMemo(() => {
    if (showLoader) {
      return (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.gold} size="large" />
        </View>
      );
    }
    if (showEmpty) {
      return (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={36} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{EMPTY_COPY[segment].title}</Text>
          <Text style={styles.emptyBody}>{EMPTY_COPY[segment].body}</Text>
          {rooms.length > 0 ? (
            <Text style={styles.emptyHint}>
              {counts.upcoming + counts.live_now + counts.drafts + counts.past} show
              {rooms.length === 1 ? '' : 's'} in other tabs — try Upcoming or Drafts.
            </Text>
          ) : segment !== 'past' ? (
            <Text style={styles.emptyHint}>Use Schedule Vault Event below to create your first show.</Text>
          ) : null}
        </View>
      );
    }
    return null;
  }, [showLoader, showEmpty, segment, rooms.length, counts]);

  const onContentAreaLayout = useCallback(
    (height: number) => {
      setContentAreaHeight(height);
      logVaultEvents('layout', {
        contentAreaHeight: height,
        windowWidth,
        windowHeight,
        bottomInset: insets.bottom,
      });
    },
    [windowWidth, windowHeight, insets.bottom],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Event management</Text>
        <Text style={styles.title}>Vault Events</Text>
        <Text style={styles.sub}>Tap a show to open its command center — livestream, queue, and moderation.</Text>

        {liveBlocked && liveGate.bannerMessage ? (
          <View style={styles.blockBanner}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.gold} />
            <Text style={styles.blockTxt}>{liveGate.bannerMessage}</Text>
          </View>
        ) : null}

        {fetchError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorTxt}>{fetchError}</Text>
            <Pressable onPress={() => void load({ force: true })} hitSlop={8}>
              <Text style={styles.errorRetry}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces
          contentContainerStyle={styles.segmentRow}
          style={styles.segmentScroll}
        >
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
      </View>

      <View
        style={styles.contentArea}
        onLayout={(e) => onContentAreaLayout(e.nativeEvent.layout.height)}
      >
        <FlatList
          style={styles.listScroll}
          data={showList ? list : []}
          keyExtractor={(entry) => entry.room.id}
          renderItem={renderEventCard}
          ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
          ListEmptyComponent={() => listEmpty}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.gold} />
          }
          contentContainerStyle={[
            styles.listScrollContent,
            {
              paddingBottom: FAB_CLEARANCE + spacing.md,
              ...(showList
                ? {}
                : {
                    flexGrow: 1,
                    minHeight: contentAreaHeight > 0 ? contentAreaHeight : undefined,
                  }),
            },
          ]}
        />
      </View>

      <View style={styles.fabHost} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={trySchedule}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Schedule vault event"
        >
          <LinearGradient
            colors={['#F0D56A', colors.gold, '#9A7B2C']}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Ionicons name="add" size={28} color="#0a0a0a" />
        </Pressable>
      </View>

      <EditVaultEventModal
        visible={editingRoom !== null}
        room={editingRoom}
        accessToken={accessToken}
        onClose={() => setEditingRoom(null)}
        onSaved={() => {
          setEditingRoom(null);
          void load({ silent: true, force: true });
        }}
      />
    </View>
  );
}

const FAB_SIZE = 60;
const FAB_CLEARANCE = FAB_SIZE + spacing.lg;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexShrink: 0,
    paddingBottom: spacing.xs,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 24,
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
    marginBottom: spacing.sm,
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.35)',
    backgroundColor: 'rgba(255,59,48,0.08)',
  },
  errorTxt: { flex: 1, fontSize: 12, color: '#fca5a5', lineHeight: 17 },
  errorRetry: { fontSize: 12, fontWeight: '800', color: colors.gold },
  segmentScroll: {
    flexGrow: 0,
    marginHorizontal: -spacing.xs,
  },
  segmentRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingVertical: 10,
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
  contentArea: {
    flex: 1,
    minHeight: 0,
  },
  listScroll: {
    flex: 1,
  },
  listScrollContent: {
    flexGrow: 1,
  },
  loaderWrap: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  listSeparator: { height: spacing.sm },
  empty: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: spacing.xl * 2,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  emptyHint: {
    marginTop: spacing.sm,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 300,
  },
  fabHost: {
    position: 'absolute',
    right: 0,
    bottom: spacing.sm,
    zIndex: 20,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  fabPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
});
