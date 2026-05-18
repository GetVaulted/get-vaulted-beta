import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fetchMyLiveRooms, type LiveRoomApiRow } from '../../api/liveRoomsRepository';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { formatEventWhen, statusLabel, vaultEventDisplayStatus } from '../../lib/vaultEventModel';
import { openSellerHostRoom } from '../../navigation/openSellerHostRoom';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'VaultEventRecap'>;

export function VaultEventRecapScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [room, setRoom] = useState<LiveRoomApiRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      if (!session?.access_token) {
        setLoading(false);
        return;
      }
      const rooms = await fetchMyLiveRooms(session.access_token);
      setRoom(rooms.find((r) => r.id === route.params.roomId) ?? null);
      setLoading(false);
    })();
  }, [route.params.roomId, session?.access_token]);

  const displayStatus = room ? vaultEventDisplayStatus(room) : 'ended';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Show recap" subtitle="Vault event summary" onBack={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : room ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>{room.title}</Text>
          <Text style={styles.status}>{statusLabel(displayStatus)}</Text>
          <Text style={styles.when}>{formatEventWhen(room, displayStatus)}</Text>
          <View style={styles.stats}>
            <Stat label="Lots queued" value={String(room.itemCount)} />
            <Stat label="Peak viewers" value={String(room.viewerCount ?? 0)} />
            <Stat label="Category" value={room.category ?? 'Collectibles'} />
          </View>
          <Text style={styles.body}>
            Recap analytics and replay clips will deepen here. Your show data is preserved on the vault timeline.
          </Text>
          {displayStatus === 'processing_recap' ? (
            <Pressable
              style={styles.btn}
              onPress={() => openSellerHostRoom(navigation, room.id)}
            >
              <Text style={styles.btnTxt}>Open command center</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.btnGhost} onPress={() => navigation.goBack()}>
              <Text style={styles.btnGhostTxt}>Back to Vault Events</Text>
            </Pressable>
          )}
        </ScrollView>
      ) : (
        <View style={styles.miss}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.textMuted} />
          <Text style={styles.body}>This event could not be loaded.</Text>
        </View>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxxl },
  title: { fontSize: 22, fontWeight: '900', color: colors.textPrimary },
  status: { fontSize: 12, fontWeight: '800', color: colors.gold, textTransform: 'uppercase' },
  when: { fontSize: 14, color: colors.textMuted },
  stats: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  stat: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statVal: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  statLbl: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  body: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
  btn: {
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  btnTxt: { color: colors.background, fontWeight: '800' },
  btnGhost: {
    borderWidth: 1,
    borderColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  btnGhostTxt: { color: colors.gold, fontWeight: '800' },
  miss: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
});
