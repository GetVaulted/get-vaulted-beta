import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { resolveListingImageUrl } from '../../api/mapWebMarketplaceListing';
import {
  fetchAccountWatchlist,
  removeFromWatchlist,
  type WatchlistItem,
} from '../../api/watchlistRepository';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { VaultImage } from '../../components/ui/VaultImage';
import { useAuth } from '../../auth/AuthContext';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Watchlist'>;

const THUMB = 56;

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatSaved(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

function statusLabel(status: string): string {
  if (status === 'auction_live') return 'Auction live';
  if (status === 'sold') return 'Sold';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(status: string) {
  if (status === 'active') return styles.statusActive;
  if (status === 'sold') return styles.statusSold;
  if (status === 'auction_live') return styles.statusLive;
  return styles.statusMuted;
}

export function WatchlistScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [rows, setRows] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.access_token) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const items = await fetchAccountWatchlist(session.access_token);
    setRows(items);
    setLoading(false);
  }, [session?.access_token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const remove = async (listingId: string) => {
    if (!session?.access_token || removingId) return;
    setRemovingId(listingId);
    try {
      const ok = await removeFromWatchlist(session.access_token, listingId);
      if (!ok) {
        Alert.alert('Could not remove', 'Try again in a moment.');
        return;
      }
      setRows((prev) => prev.filter((r) => r.listingId !== listingId));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.headerWrap}>
        <PlatformFlowHeader
          title="Watchlist"
          subtitle="Listings you saved for later"
          onBack={() => navigation.goBack()}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.gold} style={styles.loader} />
      ) : rows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={28} color={colors.gold} />
            <Text style={styles.emptyTitle}>Your watchlist is empty</Text>
            <Text style={styles.emptySub}>Save items from the marketplace with the bookmark icon on any listing.</Text>
            <Pressable
              style={styles.browseBtn}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Marketplace' })}
            >
              <Text style={styles.browseBtnTxt}>Browse marketplace</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {rows.map((row) => {
            const thumb = resolveListingImageUrl(row.thumbUrl ?? undefined);
            const fmt = row.buyingFormat === 'auction' ? 'Auction' : 'Buy now';
            const busy = removingId === row.listingId;
            return (
              <View key={row.watchlistItemId} style={styles.card}>
                <Pressable
                  style={({ pressed }) => [styles.cardMain, pressed && styles.pressed]}
                  onPress={() => navigation.navigate('ProductDetail', { productId: row.listingId })}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${row.title}`}
                >
                  {thumb ? (
                    <VaultImage uri={thumb} width={THUMB} height={THUMB} borderRadius={radii.md} />
                  ) : (
                    <View style={[styles.thumbFallback, { width: THUMB, height: THUMB }]}>
                      <Ionicons name="cube-outline" size={22} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={styles.meta}>
                    <Text style={styles.title} numberOfLines={2}>
                      {row.title}
                    </Text>
                    <Text style={styles.subline} numberOfLines={1}>
                      @{row.sellerUsername} · {fmt} · Saved {formatSaved(row.savedAt)}
                    </Text>
                    <View style={styles.priceRow}>
                      <Text style={styles.price}>{formatMoney(row.priceUsd)}</Text>
                      <View style={[styles.statusPill, statusTone(row.status)]}>
                        <Text style={styles.statusTxt}>{statusLabel(row.status)}</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
                <View style={styles.actions}>
                  <Pressable
                    style={styles.viewBtn}
                    onPress={() => navigation.navigate('ProductDetail', { productId: row.listingId })}
                  >
                    <Text style={styles.viewBtnTxt}>View item</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.removeBtn, busy && styles.removeBtnBusy]}
                    onPress={() => void remove(row.listingId)}
                    disabled={busy}
                  >
                    <Text style={styles.removeBtnTxt}>{busy ? 'Removing…' : 'Remove'}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerWrap: { paddingHorizontal: spacing.lg },
  loader: { marginTop: spacing.xl },
  emptyWrap: { flex: 1, paddingHorizontal: spacing.lg },
  empty: {
    marginTop: spacing.xl,
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.15)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  emptySub: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
    textAlign: 'center',
  },
  browseBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  browseBtnTxt: { fontSize: 13, fontWeight: '800', color: '#0a0a0a' },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardMain: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  pressed: { opacity: 0.92 },
  thumbFallback: {
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  meta: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, lineHeight: 20 },
  subline: { fontSize: 11, color: colors.textMuted },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  price: { fontSize: 14, fontWeight: '800', color: colors.gold },
  statusPill: {
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusTxt: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  statusActive: { borderColor: 'rgba(52,211,153,0.35)', backgroundColor: 'rgba(52,211,153,0.12)' },
  statusSold: { borderColor: 'rgba(251,113,133,0.35)', backgroundColor: 'rgba(251,113,133,0.12)' },
  statusLive: { borderColor: 'rgba(251,191,36,0.35)', backgroundColor: 'rgba(251,191,36,0.12)' },
  statusMuted: { borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    padding: spacing.sm,
  },
  viewBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  viewBtnTxt: { fontSize: 12, fontWeight: '800', color: colors.gold },
  removeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  removeBtnBusy: { opacity: 0.6 },
  removeBtnTxt: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
});
