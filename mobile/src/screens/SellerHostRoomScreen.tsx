import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchHostStream,
  fetchLiveRoomForHost,
  fetchSellerLiveReadiness,
  patchLiveRoomAction,
  provisionHostStream,
  rotateHostStreamKey,
  type HostStreamPayload,
  type LiveRoomHostDetail,
} from '../api/liveHostRepository';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { colors, radii, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerHostRoom'>;

function streamHealthLabel(health: string): string {
  switch ((health || '').toLowerCase()) {
    case 'live':
      return 'Live on air';
    case 'offline':
      return 'Offline';
    case 'connecting':
      return 'Connecting';
    case 'ended':
      return 'Ended';
    case 'not_provisioned':
      return 'Not set up';
    default:
      return 'Unknown';
  }
}

function roomStatusLabel(status: LiveRoomHostDetail['status']): string {
  if (status === 'live') return 'Live';
  if (status === 'ended') return 'Ended';
  return 'Scheduled';
}

async function shareCopy(label: string, value: string) {
  try {
    await Share.share({ message: value, title: label });
  } catch {
    /* dismissed */
  }
}

export function SellerHostRoomScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;
  const roomId = route.params.roomId;

  const [room, setRoom] = useState<LiveRoomHostDetail | null>(null);
  const [stream, setStream] = useState<HostStreamPayload | null>(null);
  const [oneTimeKey, setOneTimeKey] = useState<string | null>(null);
  const [ingestEndpoint, setIngestEndpoint] = useState<string | null>(null);
  const [revealKey, setRevealKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'provision' | 'rotate' | 'refresh' | 'start' | 'end' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [readinessBlocked, setReadinessBlocked] = useState<string[] | null>(null);

  const maskedKey = useMemo(() => {
    if (!oneTimeKey) return null;
    if (revealKey) return oneTimeKey;
    return `${'*'.repeat(Math.max(12, oneTimeKey.length - 4))}${oneTimeKey.slice(-4)}`;
  }, [oneTimeKey, revealKey]);

  const reloadRoom = useCallback(async () => {
    if (!token) return null;
    const r = await fetchLiveRoomForHost(token, roomId);
    setRoom(r);
    return r;
  }, [roomId, token]);

  const reloadStream = useCallback(
    async (sync: boolean) => {
      if (!token) return;
      try {
        const s = await fetchHostStream(token, roomId, { sync });
        setStream(s.stream);
        if (s.stream.ingestEndpoint) setIngestEndpoint(s.stream.ingestEndpoint);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Stream status unavailable.';
        setStream(null);
        setNotice((prev) => prev ?? `${msg} You can still start or end the show below.`);
      }
    },
    [roomId, token],
  );

  const reload = useCallback(async () => {
    if (!token) return;
    setError(null);
    await reloadRoom();
    await reloadStream(false);
  }, [reloadRoom, reloadStream, token]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Sign in to host this room.');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        await reloadRoom();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load room.');
          setLoading(false);
        }
        return;
      }
      if (cancelled) return;

      try {
        const readiness = await fetchSellerLiveReadiness(token);
        if (!cancelled) {
          setReadinessBlocked(readiness.canGoLive ? null : readiness.issues);
        }
      } catch {
        if (!cancelled) setReadinessBlocked(null);
      }

      if (!cancelled) await reloadStream(false);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadRoom, reloadStream, token]);

  const onProvision = async () => {
    if (!token) return;
    setBusy('provision');
    setError(null);
    setNotice(null);
    setRevealKey(false);
    try {
      const p = await provisionHostStream(token, roomId);
      setStream(p.stream);
      setIngestEndpoint(p.ingestEndpoint);
      setOneTimeKey(p.oneTimeStreamKey);
      setNotice('Stream ready. Paste server + key into Larix or OBS, then start streaming.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Provision failed.');
    } finally {
      setBusy(null);
    }
  };

  const onRotateKey = async () => {
    if (!token) return;
    Alert.alert(
      'Rotate stream key?',
      'Your current encoder will disconnect. Update Larix/OBS with the new key immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rotate',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy('rotate');
              setError(null);
              setNotice(null);
              setRevealKey(false);
              try {
                const p = await rotateHostStreamKey(token, roomId);
                setStream(p.stream);
                setIngestEndpoint(p.ingestEndpoint);
                setOneTimeKey(p.oneTimeStreamKey);
                setNotice('New stream key issued. Update your broadcaster now.');
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not rotate key.');
              } finally {
                setBusy(null);
              }
            })();
          },
        },
      ],
    );
  };

  const onRefreshStream = async () => {
    if (!token) return;
    setBusy('refresh');
    setError(null);
    try {
      await reloadStream(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed.');
    } finally {
      setBusy(null);
    }
  };

  const onStartShow = async () => {
    if (!token) return;
    if (readinessBlocked?.length) {
      Alert.alert('Setup incomplete', readinessBlocked.join('\n'));
      return;
    }
    setBusy('start');
    setError(null);
    try {
      await patchLiveRoomAction(token, roomId, 'start');
      await reload();
      setNotice('You are live. Buyers can join from the Live tab.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start show.');
    } finally {
      setBusy(null);
    }
  };

  const onEndShow = async () => {
    if (!token) return;
    Alert.alert('End show?', 'This ends the room for buyers. You can schedule another show later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End show',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy('end');
            setError(null);
            try {
              await patchLiveRoomAction(token, roomId, 'end');
              await reload();
              setNotice('Show ended.');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not end show.');
            } finally {
              setBusy(null);
            }
          })();
        },
      },
    ]);
  };

  const serverUrl = ingestEndpoint ?? stream?.ingestEndpoint ?? null;
  const canStart = room?.status === 'scheduled';
  const canEnd = room?.status === 'live';
  const breakRoom = room?.roomType === 'break';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button">
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {room?.title ?? 'Host room'}
          </Text>
          <Text style={styles.headerSub}>Mobile host · stream + go live</Text>
        </View>
        {room ? (
          <View style={[styles.statusPill, room.status === 'live' && styles.statusPillLive]}>
            <Text style={styles.statusPillTxt}>{roomStatusLabel(room.status)}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.gold} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTxt}>{error}</Text>
            </View>
          ) : null}
          {notice ? (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeTxt}>{notice}</Text>
            </View>
          ) : null}
          {readinessBlocked && readinessBlocked.length > 0 ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnTitle}>Before you go live</Text>
              {readinessBlocked.map((issue) => (
                <Text key={issue} style={styles.warnLine}>
                  · {issue}
                </Text>
              ))}
            </View>
          ) : null}

          {breakRoom ? (
            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>Card break room</Text>
              <Text style={styles.cardBody}>
                Stream and start/end work here. Spot picks and break board controls stay on the web seller console for now.
              </Text>
            </View>
          ) : null}

          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>1 · Set up stream</Text>
            <Text style={styles.cardBody}>
              Provision IVS, then paste the server URL and stream key into Larix Broadcaster or OBS (RTMP). Start streaming
              before you tap Go live.
            </Text>
            <Text style={styles.metaLine}>
              Encoder health: <Text style={styles.metaEm}>{stream ? streamHealthLabel(stream.streamHealth) : '—'}</Text>
            </Text>
            <View style={styles.btnRow}>
              <Pressable
                style={[styles.btnGold, busy === 'provision' && styles.btnDisabled]}
                disabled={Boolean(busy)}
                onPress={() => void onProvision()}
              >
                {busy === 'provision' ? (
                  <ActivityIndicator color="#0a0a0a" />
                ) : (
                  <Text style={styles.btnGoldTxt}>Set up stream</Text>
                )}
              </Pressable>
              <Pressable
                style={[styles.btnOutline, busy === 'refresh' && styles.btnDisabled]}
                disabled={Boolean(busy)}
                onPress={() => void onRefreshStream()}
              >
                <Text style={styles.btnOutlineTxt}>Refresh status</Text>
              </Pressable>
            </View>
            {stream?.streamHealth === 'not_provisioned' || !serverUrl ? null : (
              <Pressable
                style={[styles.btnOutline, { marginTop: spacing.sm }, busy === 'rotate' && styles.btnDisabled]}
                disabled={Boolean(busy)}
                onPress={() => void onRotateKey()}
              >
                <Text style={styles.btnOutlineTxt}>Rotate stream key</Text>
              </Pressable>
            )}
          </View>

          {serverUrl ? (
            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>2 · Broadcaster settings</Text>
              <Text style={styles.fieldLabel}>Server / ingest URL</Text>
              <Pressable style={styles.copyRow} onPress={() => void shareCopy('Ingest URL', serverUrl)}>
                <Text style={styles.copyValue} selectable numberOfLines={3}>
                  {serverUrl}
                </Text>
                <Ionicons name="share-outline" size={20} color={colors.gold} />
              </Pressable>
              {maskedKey ? (
                <>
                  <Text style={styles.fieldLabel}>Stream key (shown once)</Text>
                  <Pressable
                    style={styles.copyRow}
                    onPress={() => void shareCopy('Stream key', oneTimeKey ?? '')}
                  >
                    <Text style={styles.copyValue} selectable numberOfLines={2}>
                      {maskedKey}
                    </Text>
                    <Ionicons name="share-outline" size={20} color={colors.gold} />
                  </Pressable>
                  <Pressable onPress={() => setRevealKey((v) => !v)} hitSlop={8}>
                    <Text style={styles.revealLink}>{revealKey ? 'Hide key' : 'Reveal key'}</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={styles.cardMuted}>Tap Set up stream to generate a stream key.</Text>
              )}
            </View>
          ) : null}

          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>3 · Room status</Text>
            <Text style={styles.cardBody}>
              When your encoder shows live, tap Go live so buyers see the room on the Live tab.
            </Text>
            {canStart ? (
              <Pressable
                style={[styles.goLiveBtn, Boolean(busy) && styles.btnDisabled]}
                disabled={Boolean(busy)}
                onPress={() => void onStartShow()}
              >
                <LinearGradient colors={['#E8C547', colors.gold, '#B8922A']} style={styles.goLiveGrad}>
                  {busy === 'start' ? (
                    <ActivityIndicator color="#0a0a0a" />
                  ) : (
                    <>
                      <Ionicons name="radio-outline" size={22} color="#0a0a0a" />
                      <Text style={styles.goLiveTxt}>Go live</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            ) : null}
            {canEnd ? (
              <Pressable
                style={[styles.btnOutline, { marginTop: spacing.sm }, Boolean(busy) && styles.btnDisabled]}
                disabled={Boolean(busy)}
                onPress={() => void onEndShow()}
              >
                <Text style={[styles.btnOutlineTxt, { color: '#FF6B6B' }]}>
                  {busy === 'end' ? 'Ending…' : 'End show'}
                </Text>
              </Pressable>
            ) : null}
            {room?.status === 'ended' ? (
              <Text style={styles.cardMuted}>This room has ended. Schedule a new show from Seller HQ.</Text>
            ) : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: { ...typography.subtitle, color: colors.textPrimary },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statusPillLive: { backgroundColor: 'rgba(52,199,89,0.2)' },
  statusPillTxt: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.md, gap: spacing.md },
  errorBox: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,59,48,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.25)',
  },
  errorTxt: { color: '#FF6B6B', fontSize: 14 },
  noticeBox: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
  },
  noticeTxt: { color: colors.gold, fontSize: 14 },
  warnBox: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,149,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.25)',
  },
  warnTitle: { color: '#FFB340', fontWeight: '700', marginBottom: 6 },
  warnLine: { color: colors.textSecondary, fontSize: 13, marginBottom: 2 },
  infoCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTitle: { ...typography.subtitle, color: colors.textPrimary },
  cardBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  cardMuted: { color: colors.textMuted, fontSize: 13 },
  metaLine: { color: colors.textMuted, fontSize: 13 },
  metaEm: { color: colors.gold, fontWeight: '600' },
  fieldLabel: { fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyValue: { flex: 1, color: colors.textPrimary, fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  revealLink: { color: colors.gold, fontSize: 13, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  btnGold: {
    flex: 1,
    minWidth: 140,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  btnGoldTxt: { color: '#0a0a0a', fontWeight: '700', fontSize: 15 },
  btnOutline: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  btnOutlineTxt: { color: colors.textPrimary, fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.55 },
  goLiveBtn: { marginTop: spacing.xs, borderRadius: radii.md, overflow: 'hidden' },
  goLiveGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  goLiveTxt: { color: '#0a0a0a', fontWeight: '800', fontSize: 16 },
});
