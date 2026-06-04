import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { formatUsdDisplay } from '../../../lib/liveAuctionPricing';
import { colors, radii, spacing } from '../../../theme';

function pricingSummary(item: LiveRoomItemRow): string {
  const start = formatUsdDisplay(item.startingBidUsd ?? 1);
  const inc =
    item.bidIncrementUsd != null ? formatUsdDisplay(item.bidIncrementUsd) : 'auto';
  const reserve = item.reservePriceUsd != null ? formatUsdDisplay(item.reservePriceUsd) : null;
  const bin = item.priceUsd != null ? formatUsdDisplay(item.priceUsd) : null;
  const parts = [`Start ${start}`, `+${inc}`];
  if (reserve) parts.push(`Res ${reserve}`);
  if (bin) parts.push(`BIN ${bin}`);
  return parts.join(' · ');
}

export function VaultQueueList({
  items,
  roomType,
  roomEnded,
  busy,
  onLaunch,
  onRemove,
  onReorder,
  onEditPricing,
}: {
  items: LiveRoomItemRow[];
  roomType: 'auction' | 'sale' | 'break';
  roomEnded: boolean;
  busy: boolean;
  onLaunch: (item: LiveRoomItemRow) => void;
  onRemove: (item: LiveRoomItemRow) => void;
  onReorder: (ordered: LiveRoomItemRow[]) => void;
  onEditPricing?: (item: LiveRoomItemRow) => void;
}) {
  const queued = items.filter((i) => i.status === 'queued');
  const auctionLabel = roomType === 'sale' ? 'Buy now' : roomType === 'break' ? 'Break spot' : 'Auction';

  if (queued.length === 0) {
    return (
      <Text style={styles.empty}>Vault queue is empty — tap Add inventory to fill the lane.</Text>
    );
  }

  return (
    <DraggableFlatList
      data={queued}
      keyExtractor={(item) => item.id}
      onDragEnd={({ data }) => onReorder(data)}
      containerStyle={styles.list}
      scrollEnabled={queued.length > 2}
      renderItem={({ item, drag, isActive }: RenderItemParams<LiveRoomItemRow>) => {
        const canEditPricing =
          !item.biddingOpen && item.status !== 'sold' && item.status !== 'skipped' && !roomEnded;
        return (
          <ScaleDecorator>
            <View style={[styles.card, isActive && styles.cardActive]}>
              <Pressable onLongPress={drag} delayLongPress={120} style={styles.dragHandle}>
                <Ionicons name="reorder-three" size={22} color={colors.textMuted} />
              </Pressable>
              {item.imageUrl?.trim() ? (
                <Image source={{ uri: item.imageUrl.trim() }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPh]}>
                  <Ionicons name="diamond-outline" size={20} color={colors.gold} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.displayTitle ?? item.title}
                </Text>
                <Text style={styles.bid} numberOfLines={2}>
                  {pricingSummary(item)}
                </Text>
                <View style={styles.tagRow}>
                  <Text style={styles.tag}>{auctionLabel}</Text>
                  {item.reservePriceUsd != null ? (
                    <Text style={styles.tag}>Reserve</Text>
                  ) : (
                    <Text style={styles.tag}>No reserve</Text>
                  )}
                  {item.priceUsd != null ? <Text style={styles.tag}>Buy now</Text> : null}
                </View>
              </View>
              {!roomEnded ? (
                <View style={styles.actions}>
                  {canEditPricing && onEditPricing ? (
                    <Pressable style={styles.editBtn} disabled={busy} onPress={() => onEditPricing(item)}>
                      <Text style={styles.editBtnTxt}>Pricing</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={styles.launch} disabled={busy} onPress={() => onLaunch(item)}>
                    <Text style={styles.launchTxt}>Launch</Text>
                  </Pressable>
                  <Pressable disabled={busy} onPress={() => onRemove(item)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                  </Pressable>
                </View>
              ) : null}
            </View>
          </ScaleDecorator>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 220 },
  empty: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  cardActive: {
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  dragHandle: { padding: 4 },
  thumb: { width: 52, height: 64, borderRadius: radii.sm, backgroundColor: 'rgba(0,0,0,0.4)' },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  bid: { fontSize: 11, fontWeight: '600', color: colors.gold, marginTop: 2, lineHeight: 15 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tag: { fontSize: 9, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  actions: { alignItems: 'flex-end', gap: 6 },
  editBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  editBtnTxt: { fontSize: 10, fontWeight: '800', color: colors.gold },
  launch: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  launchTxt: { fontSize: 11, fontWeight: '800', color: '#0a0a0a' },
});
