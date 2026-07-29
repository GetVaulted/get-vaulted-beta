import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../auth/AuthContext';
import {
  fetchAdminOverview,
  type AdminOverviewMetrics,
} from '../../api/adminOpsRepository';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { ADMIN_OPS_MODULES, type AdminOpsModule } from '../../lib/adminOpsModules';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminOpsHome'>;

function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function metricValue(
  data: AdminOverviewMetrics | null,
  module: AdminOpsModule,
): number | null {
  if (!data || !module.metricKey) return null;
  const raw = data[module.metricKey];
  return typeof raw === 'number' ? raw : null;
}

export function AdminOpsHomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const token = session?.access_token;
  const [data, setData] = useState<AdminOverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const columns = width >= 900 ? 3 : width >= 640 ? 2 : 1;
  const gap = spacing.md;
  const tileWidth = (width - spacing.lg * 2 - gap * (columns - 1)) / columns;

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!token) {
        setError('Sign in required.');
        setLoading(false);
        return;
      }
      if (!opts?.quiet) setLoading(true);
      setError(null);
      try {
        setData(await fetchAdminOverview(token));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load Ops.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      const id = setInterval(() => void load({ quiet: true }), 30_000);
      return () => clearInterval(id);
    }, [load]),
  );

  const by = data?.onlineByPlatform;
  const onlineHint = by
    ? `iOS ${by.ios} · Android ${by.android} · Web ${by.web}`
    : 'Signed-in, last 2 min';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader
        title="Ops Command Center"
        subtitle="Live platform pulse — triage and act"
        onBack={() => navigation.goBack()}
      />

      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
          <Text style={styles.muted}>Loading metrics…</Text>
        </View>
      ) : error && !data ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retry}>
            <Text style={styles.retryTxt}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load({ quiet: true });
              }}
              tintColor={colors.gold}
            />
          }
        >
          <View style={styles.strip}>
            <MetricChip label="Online now" value={data?.onlineNow ?? 0} hint={onlineHint} warn={false} />
            <MetricChip label="Live shows" value={data?.liveActive ?? 0} warn={(data?.liveActive ?? 0) > 0} />
            <MetricChip label="Tickets" value={data?.openSupportTickets ?? 0} warn={(data?.openSupportTickets ?? 0) > 0} />
            <MetricChip label="Reports" value={data?.openReports ?? 0} warn={(data?.openReports ?? 0) > 0} />
            <MetricChip label="Pending listings" value={data?.pendingListings ?? 0} warn={false} />
            <MetricChip label="Payout reviews" value={data?.sellersPendingPayoutReview ?? 0} warn={(data?.sellersPendingPayoutReview ?? 0) > 0} />
          </View>

          <View style={styles.financeRow}>
            <Text style={styles.financeLabel}>GMV (recent)</Text>
            <Text style={styles.financeValue}>{formatUsd(data?.finance.gmvUsd)}</Text>
            <Text style={styles.financeSep}>·</Text>
            <Text style={styles.financeLabel}>Fees</Text>
            <Text style={styles.financeValue}>{formatUsd(data?.finance.platformFeesUsd)}</Text>
            <Text style={styles.financeSep}>·</Text>
            <Text style={styles.financeLabel}>Pending payouts</Text>
            <Text style={styles.financeValue}>{formatUsd(data?.finance.pendingPayoutsUsd)}</Text>
          </View>

          <Text style={styles.sectionTitle}>Ops modules</Text>
          <View style={[styles.grid, { gap }]}>
            {ADMIN_OPS_MODULES.map((mod) => {
              const count = metricValue(data, mod);
              return (
                <Pressable
                  key={mod.id}
                  onPress={() => navigation.navigate(mod.route)}
                  style={({ pressed }) => [
                    styles.tile,
                    { width: tileWidth },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.tileTop}>
                    <View style={styles.tileIcon}>
                      <Ionicons name={mod.icon} size={20} color={colors.gold} />
                    </View>
                    {count != null ? (
                      <Text style={[styles.tileCount, count > 0 && styles.tileCountHot]}>{count}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.tileTitle}>{mod.title}</Text>
                  <Text style={styles.tileSub} numberOfLines={2}>
                    {mod.description}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {data?.updatedAt ? (
            <Text style={styles.updated}>
              Updated {new Date(data.updatedAt).toLocaleString()}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function MetricChip({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: number;
  hint?: string;
  warn: boolean;
}) {
  return (
    <View style={[styles.chip, warn && value > 0 && styles.chipWarn]}>
      <Text style={styles.chipValue}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
      {hint ? <Text style={styles.chipHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg, backgroundColor: colors.background },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.live, fontSize: 14, textAlign: 'center', paddingHorizontal: spacing.lg },
  retry: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  retryTxt: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minWidth: 100,
    flexGrow: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  chipWarn: { borderColor: 'rgba(255,59,48,0.35)', backgroundColor: 'rgba(255,59,48,0.08)' },
  chipValue: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  chipLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
  chipHint: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  financeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  financeLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  financeValue: { fontSize: 13, color: colors.gold, fontWeight: '700' },
  financeSep: { color: colors.textMuted },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: 6,
  },
  pressed: { opacity: 0.9 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldSoft,
  },
  tileCount: { fontSize: 20, fontWeight: '800', color: colors.textSecondary },
  tileCountHot: { color: colors.live },
  tileTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  tileSub: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  updated: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
});
