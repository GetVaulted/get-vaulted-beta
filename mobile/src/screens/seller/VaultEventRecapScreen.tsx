import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fetchMyLiveRooms, type LiveRoomApiRow } from '../../api/liveRoomsRepository';
import { fetchHostConsole } from '../../api/liveHostRepository';
import type { LiveRoomItemRow } from '../../api/liveRoomControlRepository';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { SellerBreakSpotBoardSheet } from '../../components/seller/liveOverlay/SellerBreakSpotBoardSheet';
import { formatUsdDisplay } from '../../lib/liveAuctionPricing';
import { isVariantSalesFormat } from '../../lib/liveItemVariant';
import { summarizeVariantSpotBoard } from '../../lib/liveVariantSpotBoard';
import { formatEventWhen, statusLabel, vaultEventDisplayStatus } from '../../lib/vaultEventModel';
import { openSellerHostRoom } from '../../navigation/openSellerHostRoom';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'VaultEventRecap'>;

function itemStatusLabel(status: LiveRoomItemRow['status']): string {
  switch (status) {
    case 'sold':
      return 'Sold';
    case 'active':
      return 'On air';
    case 'skipped':
      return 'Skipped';
    default:
      return 'Queued';
  }
}

/** Summary line for a plain auction/buy-now lot (not a team/spot break). */
function nonVariantSaleSummary(item: LiveRoomItemRow): string {
  const price = item.priceUsd ?? item.currentBidUsd;
  const priceLabel = price != null ? formatUsdDisplay(price) : null;
  if (item.status !== 'sold') {
    return priceLabel ?? itemStatusLabel(item.status);
  }
  const buyer = item.lastHighBidderUsername?.trim();
  if (buyer && priceLabel) return `@${buyer} · ${priceLabel}`;
  if (buyer) return `@${buyer}`;
  return priceLabel ?? 'Sold';
}

export function VaultEventRecapScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;
  const roomId = route.params.roomId;

  const [room, setRoom] = useState<LiveRoomApiRow | null>(null);
  const [items, setItems] = useState<LiveRoomItemRow[]>([]);
  const [itemsFailed, setItemsFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [boardItem, setBoardItem] = useState<LiveRoomItemRow | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [rooms, console] = await Promise.all([
        fetchMyLiveRooms(token),
        // Every item from the show, regardless of status — the recap intentionally does not
        // filter to "active"/"queued" the way the live command center's queue list does, since
        // that's exactly why sold spots became invisible once a show ended.
        fetchHostConsole(token, roomId).catch(() => null),
      ]);
      setRoom(rooms.find((r) => r.id === roomId) ?? null);
      if (console) {
        setItems([...console.items].sort((a, b) => a.sortOrder - b.sortOrder));
        setItemsFailed(false);
      } else {
        setItems([]);
        setItemsFailed(true);
      }
    } finally {
      setLoading(false);
    }
  }, [roomId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayStatus = room ? vaultEventDisplayStatus(room) : 'ended';
  const soldCount = items.filter((i) => i.status === 'sold').length;

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
            <Stat label="Items" value={String(items.length || room.itemCount)} />
            <Stat label="Sold" value={String(soldCount)} />
            <Stat label="Peak viewers" value={String(room.viewerCount ?? 0)} />
          </View>

          {items.length > 0 ? (
            <View style={styles.itemsSection}>
              <Text style={styles.sectionLabel}>Items from this show</Text>
              {items.map((item) => {
                const variant = isVariantSalesFormat(item.salesFormat);
                const board = variant ? summarizeVariantSpotBoard(item) : null;
                const summary = board
                  ? `${board.soldCount} of ${board.rows.length} sold`
                  : nonVariantSaleSummary(item);
                return (
                  <Pressable
                    key={item.id}
                    style={styles.itemRow}
                    disabled={!variant}
                    onPress={() => setBoardItem(item)}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.displayTitle ?? item.title}
                      </Text>
                      <Text style={styles.itemMeta}>{summary}</Text>
                    </View>
                    {variant ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : itemsFailed ? (
            <Text style={styles.body}>Item data couldn’t load for this show. Pull back and try again.</Text>
          ) : null}

          <Text style={styles.body}>
            Your show data is preserved on the vault timeline. If teams or supps still need recording, open the
            command center to finish Mark sold.
          </Text>
          <Pressable style={styles.btn} onPress={() => openSellerHostRoom(navigation, room.id)}>
            <Text style={styles.btnTxt}>Open command center</Text>
          </Pressable>
          <Pressable style={styles.btnGhost} onPress={() => navigation.goBack()}>
            <Text style={styles.btnGhostTxt}>Back to Vault Events</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={styles.miss}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.textMuted} />
          <Text style={styles.body}>This event could not be loaded.</Text>
        </View>
      )}
      <SellerBreakSpotBoardSheet visible={Boolean(boardItem)} onClose={() => setBoardItem(null)} item={boardItem} />
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
  itemsSection: { gap: spacing.xs },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 2,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 6,
  },
  itemTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  itemMeta: { fontSize: 12, fontWeight: '600', color: colors.gold, marginTop: 2 },
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
