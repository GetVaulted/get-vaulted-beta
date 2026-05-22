import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatLiveDiscoveryProbeLine,
  probeLiveDiscoveryFromDevice,
} from '../../api/liveDiscoveryProbeRepository';
import { fetchQaSessionDebug, type QaSessionDebugResponse } from '../../api/qaSessionDebugRepository';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { confirmClearQaSession } from '../../lib/clearQaSession';
import { getQaEnvSnapshot } from '../../lib/qaEnvSnapshot';
import {
  formatLiveDiscoveryMetaLine,
  getLiveDiscoveryMeta,
  subscribeLiveDiscoveryMeta,
} from '../../lib/liveDiscoveryMeta';
import { clearHomeFeedCache } from '../../lib/homeFeedCache';
import { fetchLiveShowsForDiscovery } from '../../api/liveShowsDiscoveryRepository';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'QaEnvironmentDiagnostics'>;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} selectable>
        {value}
      </Text>
    </View>
  );
}

function str(value: unknown, fallback = '—'): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function formatPublicRooms(server: QaSessionDebugResponse): string {
  const count = server.liveDiscovery?.publicRoomCount;
  const sellerCount = server.liveDiscovery?.sellerRoomCount;
  if (typeof count !== 'number') return '—';
  return `${count} (seller: ${sellerCount ?? 'n/a'})`;
}

export function QaEnvironmentDiagnosticsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const env = getQaEnvSnapshot();
  const [discoveryLine, setDiscoveryLine] = useState(formatLiveDiscoveryMetaLine());
  const [server, setServer] = useState<QaSessionDebugResponse | null>(null);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [probeLine, setProbeLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadServer = useCallback(async () => {
    setBusy(true);
    setServerErr(null);
    try {
      const [serverPayload, probe] = await Promise.all([
        fetchQaSessionDebug().catch((e) => {
          throw e instanceof Error ? e : new Error('Failed to load session-debug');
        }),
        probeLiveDiscoveryFromDevice().catch((e) => {
          const msg = e instanceof Error ? e.message : 'Probe failed';
          setProbeLine(`probe error: ${msg}`);
          return null;
        }),
      ]);
      setServer(serverPayload ?? null);
      if (probe) {
        setProbeLine(formatLiveDiscoveryProbeLine(probe) ?? 'probe unavailable');
      }
    } catch (e) {
      setServer(null);
      setServerErr(e instanceof Error ? e.message : 'Failed to load session-debug');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadServer();
    return subscribeLiveDiscoveryMeta(() => {
      setDiscoveryLine(formatLiveDiscoveryMetaLine(getLiveDiscoveryMeta()));
    });
  }, [loadServer]);

  const bustDiscovery = async () => {
    await clearHomeFeedCache();
    await fetchLiveShowsForDiscovery();
    setDiscoveryLine(formatLiveDiscoveryMetaLine(getLiveDiscoveryMeta()));
  };

  const identity = server?.identityConsistency;
  const session = server?.session;
  const sellerReadiness = server?.sellerReadiness;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="QA environment" subtitle="Env + session parity" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void loadServer()} tintColor={colors.gold} />}
      >
        <Text style={styles.section}>This device</Text>
        <Row label="API base URL" value={env.apiBaseUrl ?? '(not set)'} />
        <Row label="Supabase project ref" value={env.supabaseProjectRef ?? '(not set)'} />
        <Row label="Beta aligned" value={env.alignedWithBeta ? 'yes' : 'no — fix mobile/.env'} />
        <Row label="Logged-in email" value={user?.email ?? '(signed out)'} />
        <Row label="Supabase user id" value={user?.id ?? '—'} />
        <Row label="Room discovery" value={discoveryLine} />
        {probeLine ? <Row label="Device API probe" value={probeLine} /> : null}

        <Text style={styles.section}>Server session-debug</Text>
        {busy && !server ? <ActivityIndicator color={colors.gold} /> : null}
        {serverErr ? <Text style={styles.err}>{serverErr}</Text> : null}
        {server ? (
          <>
            <Row
              label="Prisma user id"
              value={str(session?.prismaUserId ?? identity?.canonicalPrismaUserId)}
            />
            <Row label="Canonical id" value={str(identity?.canonicalPrismaUserId)} />
            {identity?.warning ? <Text style={styles.warn}>{identity.warning}</Text> : null}
            <Row
              label="Seller readiness"
              value={sellerReadiness?.summary ?? '(not a seller session)'}
            />
            <Row label="Stripe account" value={str(sellerReadiness?.stripeAccountId)} />
            <Row label="Public live rooms" value={formatPublicRooms(server)} />
            <Row label="DB project ref" value={str(server.environment?.databaseProjectRef)} />
          </>
        ) : null}

        <Pressable style={styles.secondaryBtn} onPress={() => void bustDiscovery()}>
          <Text style={styles.secondaryBtnTxt}>Force discovery refetch</Text>
        </Pressable>

        <Pressable
          style={styles.destructiveBtn}
          onPress={() => confirmClearQaSession(signOut)}
        >
          <Text style={styles.destructiveBtnTxt}>Clear QA session</Text>
        </Pressable>

        <Text style={styles.hint}>
          Before manual QA: run `npm run qa:local-env-check` in web/, then Clear QA Session on every device and sign in again.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { paddingBottom: spacing.xxxl, gap: spacing.sm },
  section: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  row: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  rowValue: { fontSize: 14, color: colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  err: { color: '#e08080', fontSize: 13 },
  warn: { color: colors.gold, fontSize: 13, marginVertical: spacing.xs },
  secondaryBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryBtnTxt: { color: colors.textPrimary, fontWeight: '700' },
  destructiveBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(224, 128, 128, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(224, 128, 128, 0.4)',
    alignItems: 'center',
  },
  destructiveBtnTxt: { color: '#e08080', fontWeight: '800' },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginTop: spacing.md },
});
