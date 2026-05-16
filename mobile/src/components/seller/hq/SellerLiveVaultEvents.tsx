import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveRoomApiRow } from '../../../api/liveRoomsRepository';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';

function formatWhen(iso: string | null, status: LiveRoomApiRow['status']): string {
  if (status === 'live') return 'On air now';
  if (!iso) return 'Schedule TBA';
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Scheduled';
  }
}

export function SellerLiveVaultEvents({
  rooms,
  loading,
  onHostRoom,
  onScheduleNew,
  onGoLive,
}: {
  rooms: LiveRoomApiRow[];
  loading: boolean;
  onHostRoom: (roomId: string) => void;
  onScheduleNew: () => void;
  onGoLive: () => void;
}) {
  const upcoming = rooms.filter((r) => r.status === 'scheduled' || r.status === 'live');

  if (loading && upcoming.length === 0) {
    return <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.lg }} />;
  }

  if (upcoming.length === 0) {
    return (
      <View style={styles.emptyShell}>
        <LinearGradient
          colors={['rgba(212,175,55,0.2)', 'rgba(8,8,10,0.98)']}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name="diamond-outline" size={40} color={colors.gold} />
        <Text style={styles.emptyTitle}>Launch your first Vault event</Text>
        <Text style={styles.emptyBody}>
          Schedule a show, build your live queue, and enter the command center when you are ready to take the lane.
        </Text>
        <Pressable style={styles.emptyPrimary} onPress={onScheduleNew}>
          <Text style={styles.emptyPrimaryTxt}>Schedule Vault event</Text>
        </Pressable>
        <Pressable style={styles.emptySecondary} onPress={onGoLive}>
          <Text style={styles.emptySecondaryTxt}>Go live now</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={hq.sectionEyebrow}>Live queue</Text>
      <Text style={hq.sectionTitle}>Your vault events</Text>
      {upcoming.map((room) => {
        const isLive = room.status === 'live';
        return (
          <Pressable
            key={room.id}
            style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}
            onPress={() => onHostRoom(room.id)}
          >
            <LinearGradient
              colors={
                isLive
                  ? ['rgba(255,59,48,0.15)', 'rgba(12,11,9,0.98)']
                  : ['rgba(212,175,55,0.1)', 'rgba(12,11,9,0.98)']
              }
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.eventTop}>
              <View style={[styles.statusPill, isLive && styles.statusPillLive]}>
                <Text style={styles.statusTxt}>{isLive ? 'Live' : 'Scheduled'}</Text>
              </View>
              <Text style={styles.eventMeta}>{room.category}</Text>
            </View>
            <Text style={styles.eventTitle} numberOfLines={2}>
              {room.title}
            </Text>
            <Text style={styles.eventWhen}>{formatWhen(room.scheduledStartAt, room.status)}</Text>
            <View style={styles.eventCta}>
              <Text style={styles.eventCtaTxt}>{isLive ? 'Open command center' : 'Host room'}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.gold} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.lg },
  pressed: { opacity: 0.92 },
  eventCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    overflow: 'hidden',
    padding: spacing.md,
    gap: 6,
  },
  eventTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.15)',
  },
  statusPillLive: { backgroundColor: colors.liveGlow },
  statusTxt: { fontSize: 10, fontWeight: '800', color: colors.gold },
  eventMeta: { fontSize: 11, color: colors.textMuted },
  eventTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  eventWhen: { fontSize: 13, color: colors.textSecondary },
  eventCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  eventCtaTxt: { fontSize: 13, fontWeight: '700', color: colors.gold },
  emptyShell: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    overflow: 'hidden',
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginTop: spacing.sm },
  emptyBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  emptyPrimary: {
    marginTop: spacing.md,
    backgroundColor: colors.gold,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
  },
  emptyPrimaryTxt: { fontWeight: '800', color: '#0a0a0a' },
  emptySecondary: { paddingVertical: 10 },
  emptySecondaryTxt: { fontWeight: '700', color: colors.gold },
});
