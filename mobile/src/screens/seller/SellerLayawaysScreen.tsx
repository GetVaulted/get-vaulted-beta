import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchSellerLayaways,
  type SellerLayawayCounts,
  type SellerLayawayRow,
} from '../../api/layawayRepository';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { useAuth } from '../../auth/AuthContext';
import { useVaultEcosystemEvents } from '../../hooks/useVaultEcosystemEvents';
import { sellerLayawayStatusLabel } from '../../lib/sellerLayawayDisplay';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerLayaways'>;

type FilterKey = 'all' | 'active' | 'ready' | 'overdue';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'ready', label: 'Ready to ship' },
  { key: 'overdue', label: 'Overdue' },
];

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

function matchesFilter(row: SellerLayawayRow, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return row.displayStatus === 'active' || row.status === 'active';
  if (filter === 'ready') return row.status === 'completed' || row.displayStatus === 'completed';
  return row.displayStatus === 'overdue' || row.status === 'defaulted';
}

function countForFilter(counts: SellerLayawayCounts, filter: FilterKey): number {
  if (filter === 'active') return counts.active;
  if (filter === 'ready') return counts.readyToShip;
  if (filter === 'overdue') return counts.overdueOrDefaulted;
  return counts.active + counts.readyToShip + counts.overdueOrDefaulted;
}

export function SellerLayawaysScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session, user } = useAuth();
  const [filter, setFilter] = useState<FilterKey>(route.params?.filter ?? 'all');
  const [rows, setRows] = useState<SellerLayawayRow[]>([]);
  const [counts, setCounts] = useState<SellerLayawayCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);

  useEffect(() => {
    if (route.params?.filter) setFilter(route.params.filter);
  }, [route.params?.filter]);

  const load = useCallback(
    async (opts?: { pull?: boolean }) => {
      if (!session?.access_token) {
        setRows([]);
        setCounts(null);
        setError(null);
        setMismatch(false);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (opts?.pull) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setMismatch(false);

      try {
        const data = await fetchSellerLayaways(session.access_token);
        setRows(data.layaways);
        setCounts(data.counts);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not load layaways.';
        setError(msg);
        console.warn('[SellerLayaways] load failed', { error: msg });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session?.access_token],
  );

  useEffect(() => {
    if (!counts) {
      setMismatch(false);
      return;
    }
    const expected = countForFilter(counts, filter);
    const filteredCount = rows.filter((r) => matchesFilter(r, filter)).length;
    if (expected > 0 && rows.length === 0) {
      setMismatch(true);
      console.warn('[SellerLayaways] count/list mismatch — counts show layaways but list is empty', {
        counts,
        filter,
      });
      return;
    }
    if (expected > 0 && filteredCount === 0 && rows.length > 0) {
      setMismatch(true);
      console.warn('[SellerLayaways] count/filter mismatch — counts expect rows for filter', {
        counts,
        filter,
        layawayStatuses: rows.map((r) => ({ id: r.id, status: r.status, displayStatus: r.displayStatus })),
      });
      return;
    }
    setMismatch(false);
  }, [counts, filter, rows]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onLayawayEvent = useCallback(() => {
    void load();
  }, [load]);

  useVaultEcosystemEvents(user?.id, {
    enabled: Boolean(session?.access_token && user?.id),
    onLayaway: onLayawayEvent,
  });

  const filtered = useMemo(() => rows.filter((r) => matchesFilter(r, filter)), [filter, rows]);

  const onRefresh = useCallback(() => {
    void load({ pull: true });
  }, [load]);

  const showInitialSpinner = loading && rows.length === 0 && !error;

  const listEmpty = !showInitialSpinner && (
    <View style={styles.emptyWrap}>
      {error ? (
        <>
          <Text style={styles.emptyTitle}>Could not load layaways</Text>
          <Text style={styles.empty}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryTxt}>Retry</Text>
          </Pressable>
        </>
      ) : mismatch ? (
        <>
          <Text style={styles.emptyTitle}>Layaway data mismatch</Text>
          <Text style={styles.empty}>
            Seller HQ shows layaways but this list could not load them. Pull to refresh or tap retry.
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryTxt}>Retry</Text>
          </Pressable>
        </>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>
          No layaway sales yet. When a buyer starts layaway on your listing, it appears here.
        </Text>
      ) : (
        <Text style={styles.empty}>No layaways match this filter.</Text>
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.headerWrap}>
        <PlatformFlowHeader
          title="Sales layaways"
          subtitle="Reserved items — do not ship until paid in full"
          onBack={() => navigation.goBack()}
        />
      </View>

      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterPill, filter === f.key && styles.filterPillOn]}
            >
              <Text style={[styles.filterTxt, filter === f.key && styles.filterTxtOn]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {showInitialSpinner ? (
        <View style={styles.spinnerWrap}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          style={styles.list}
          contentContainerStyle={[
            filtered.length === 0 ? styles.listEmptyContainer : styles.listContent,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
          }
          ListEmptyComponent={listEmpty}
          renderItem={({ item: r }) => (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('SellerLayawayDetail', { layawayId: r.id })}
            >
              <View style={styles.cardTop}>
                {r.listingImageUrl ? (
                  <Image source={{ uri: r.listingImageUrl }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]} />
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.title} numberOfLines={2}>
                    {r.listingTitle}
                  </Text>
                  <Text style={styles.buyer}>@{r.buyerUsername}</Text>
                  <Text style={styles.status}>{sellerLayawayStatusLabel(r.displayStatus)}</Text>
                </View>
              </View>
              <View style={styles.metaGrid}>
                <Meta label="Deposit" value={formatMoney(r.depositAmountUsd)} />
                <Meta label="Paid" value={formatMoney(r.amountPaidUsd)} />
                <Meta label="Remaining" value={formatMoney(r.remainingBalanceUsd)} />
                <Meta label="Due" value={formatDate(r.dueAt)} />
                <Meta label="Created" value={formatDate(r.createdAt)} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaCell}>
      <Text style={styles.metaLbl}>{label}</Text>
      <Text style={styles.metaVal}>{value}</Text>
    </View>
  );
}

const FILTER_BAR_HEIGHT = 44;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerWrap: { flexShrink: 0, paddingHorizontal: spacing.lg },
  filterBar: {
    flexShrink: 0,
    height: FILTER_BAR_HEIGHT,
    marginBottom: spacing.sm,
  },
  filterScroll: {
    flexGrow: 0,
    height: FILTER_BAR_HEIGHT,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    minHeight: FILTER_BAR_HEIGHT,
  },
  filterPill: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  filterPillOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.1)' },
  filterTxt: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  filterTxtOn: { color: colors.gold },
  spinnerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.lg, gap: spacing.md },
  listEmptyContainer: { flexGrow: 1, paddingHorizontal: spacing.lg },
  emptyWrap: { paddingTop: spacing.xl, alignItems: 'center', gap: spacing.sm },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  empty: { color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  retryTxt: { color: colors.gold, fontWeight: '800', fontSize: 13 },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  cardBody: { flex: 1, minWidth: 0 },
  thumb: { width: 72, height: 72, borderRadius: radii.md },
  thumbEmpty: { backgroundColor: colors.surfaceElevated },
  title: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  buyer: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  status: { color: colors.gold, fontSize: 12, fontWeight: '800', marginTop: 4, textTransform: 'uppercase' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metaCell: {
    width: '47%',
    paddingVertical: spacing.xs,
  },
  metaLbl: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  metaVal: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 2 },
});
