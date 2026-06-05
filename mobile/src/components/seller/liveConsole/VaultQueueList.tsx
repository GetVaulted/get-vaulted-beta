import { Ionicons } from '@expo/vector-icons';
import type { ReactElement } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { formatUsdDisplay, queueItemQuantity } from '../../../lib/liveAuctionPricing';
import { queueStatusLabel } from '../liveOverlay/SellerQueueStrip';
import { colors, radii, spacing } from '../../../theme';

function pricingSummary(item: LiveRoomItemRow): string {
  const qty = queueItemQuantity(item);
  const start = formatUsdDisplay(item.startingBidUsd ?? 1);
  const reserve = item.reservePriceUsd != null ? formatUsdDisplay(item.reservePriceUsd) : null;
  const bin = item.priceUsd != null ? formatUsdDisplay(item.priceUsd) : null;
  const parts = [`Qty ${qty}`, `Start ${start}`];
  if (reserve) parts.push(`Res ${reserve}`);
  if (bin) parts.push(`BIN ${bin}`);
  return parts.join(' · ');
}

function VaultQueueRow({
  item,
  roomEnded,
  busy,
  drag,
  isActive,
  onLaunch,
  onRemove,
  onEditPricing,
}: {
  item: LiveRoomItemRow;
  roomEnded: boolean;
  busy: boolean;
  drag?: () => void;
  isActive?: boolean;
  onLaunch: (item: LiveRoomItemRow) => void;
  onRemove: (item: LiveRoomItemRow) => void;
  onEditPricing?: (item: LiveRoomItemRow) => void;
}) {
  const canEditPricing =
    !item.biddingOpen && item.status !== 'sold' && item.status !== 'skipped' && !roomEnded;
  const reserve = item.reservePriceUsd != null ? formatUsdDisplay(item.reservePriceUsd) : null;
  const bin = item.priceUsd != null ? formatUsdDisplay(item.priceUsd) : null;

  return (
    <View style={[styles.card, isActive && styles.cardActive]}>
      {drag ? (
        <Pressable onLongPress={drag} delayLongPress={120} style={styles.dragHandle}>
          <Ionicons name="reorder-three" size={22} color={colors.textMuted} />
        </Pressable>
      ) : null}
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
        {reserve ? <Text style={styles.metaLine}>Reserve {reserve}</Text> : null}
        {bin ? <Text style={styles.metaLine}>Buy now {bin}</Text> : null}
        <View style={styles.tagRow}>
          <Text style={styles.tag}>{queueStatusLabel(item.status)}</Text>
        </View>
      </View>
      {!roomEnded ? (
        <View style={styles.actions}>
          {canEditPricing && onEditPricing ? (
            <Pressable style={styles.editBtn} disabled={busy} onPress={() => onEditPricing(item)}>
              <Text style={styles.editBtnTxt}>Edit</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.launch} disabled={busy} onPress={() => onLaunch(item)}>
            <Text style={styles.launchTxt}>Start</Text>
          </Pressable>
          <Pressable disabled={busy} onPress={() => onRemove(item)} hitSlop={8}>
            <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
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
  scrollContainer = false,
  listHeaderComponent,
  contentContainerStyle,
}: {
  items: LiveRoomItemRow[];
  roomType: 'auction' | 'sale' | 'break';
  roomEnded: boolean;
  busy: boolean;
  onLaunch: (item: LiveRoomItemRow) => void;
  onRemove: (item: LiveRoomItemRow) => void;
  onReorder: (ordered: LiveRoomItemRow[]) => void;
  onEditPricing?: (item: LiveRoomItemRow) => void;
  /** When true, this list is the vertical scroll container (not nested in a ScrollView). */
  scrollContainer?: boolean;
  listHeaderComponent?: ReactElement | null;
  contentContainerStyle?: object;
}) {
  const queued = items.filter((i) => i.status === 'queued');

  const emptyCopy = (
    <Text style={styles.empty}>Vault queue is empty — tap Add inventory to fill the lane.</Text>
  );

  if (scrollContainer) {
    return (
      <FlatList
        data={queued}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <VaultQueueRow
            item={item}
            roomEnded={roomEnded}
            busy={busy}
            onLaunch={onLaunch}
            onRemove={onRemove}
            onEditPricing={onEditPricing}
          />
        )}
        ListHeaderComponent={listHeaderComponent ?? undefined}
        ListEmptyComponent={() => emptyCopy}
        style={styles.scrollList}
        contentContainerStyle={[
          styles.scrollListContent,
          contentContainerStyle,
          queued.length === 0 ? styles.scrollListEmpty : undefined,
        ]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      />
    );
  }

  if (queued.length === 0) {
    return (
      <View>
        {listHeaderComponent}
        {emptyCopy}
      </View>
    );
  }

  return (
    <View style={styles.embeddedList}>
      {listHeaderComponent}
      {queued.map((item) => (
        <VaultQueueRow
          key={item.id}
          item={item}
          roomEnded={roomEnded}
          busy={busy}
          onLaunch={onLaunch}
          onRemove={onRemove}
          onEditPricing={onEditPricing}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollList: { flex: 1 },
  scrollListContent: { paddingBottom: spacing.md },
  scrollListEmpty: { flexGrow: 1 },
  embeddedList: { gap: 0 },
  empty: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: spacing.xs },
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
  metaLine: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
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
