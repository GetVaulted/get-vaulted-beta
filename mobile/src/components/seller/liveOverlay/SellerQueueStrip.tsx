import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { formatUsdDisplay, queueItemQuantity } from '../../../lib/liveAuctionPricing';
import { colors, radii, spacing } from '../../../theme';
import { QueueSaleTypePill } from '../liveConsole/QueueSaleTypePill';

export const SELLER_QUEUE_STRIP_CARD_W = 176;

export function queueStatusLabel(status: LiveRoomItemRow['status']): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'sold':
      return 'Sold';
    case 'skipped':
      return 'Skipped';
    default:
      return 'Queued';
  }
}

export function SellerQueueStrip({
  items,
  roomEnded,
  roomLive,
  busy,
  onPin,
  onEdit,
  onRemove,
  onAddItem,
}: {
  items: LiveRoomItemRow[];
  roomEnded: boolean;
  roomLive: boolean;
  busy: boolean;
  onPin: (item: LiveRoomItemRow) => void;
  onEdit?: (item: LiveRoomItemRow) => void;
  onRemove: (item: LiveRoomItemRow) => void;
  onAddItem: () => void;
}) {
  const queued = items.filter((i) => i.status === 'queued');

  if (queued.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>Queue is empty</Text>
        <Text style={styles.emptyBody}>Add inventory to line up lots before you go live.</Text>
        {!roomEnded ? (
          <Pressable style={styles.emptyAdd} onPress={onAddItem} disabled={busy}>
            <Ionicons name="add" size={18} color="#0a0a0a" />
            <Text style={styles.emptyAddTxt}>Add item</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      keyboardShouldPersistTaps="handled"
    >
      {queued.map((item) => (
        <SellerQueueStripCard
          key={item.id}
          item={item}
          roomEnded={roomEnded}
          roomLive={roomLive}
          busy={busy}
          onPin={onPin}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      ))}
    </ScrollView>
  );
}

function SellerQueueStripCard({
  item,
  roomEnded,
  roomLive,
  busy,
  onPin,
  onEdit,
  onRemove,
}: {
  item: LiveRoomItemRow;
  roomEnded: boolean;
  roomLive: boolean;
  busy: boolean;
  onPin: (item: LiveRoomItemRow) => void;
  onEdit?: (item: LiveRoomItemRow) => void;
  onRemove: (item: LiveRoomItemRow) => void;
}) {
  const qty = queueItemQuantity(item);
  const start = formatUsdDisplay(item.startingBidUsd ?? 1);
  const reserve = item.reservePriceUsd != null ? formatUsdDisplay(item.reservePriceUsd) : null;
  const bin = item.priceUsd != null ? formatUsdDisplay(item.priceUsd) : null;
  const thumb = item.imageUrl?.trim();
  const canEdit = !item.biddingOpen && item.status === 'queued' && !roomEnded;

  return (
    <View style={styles.card}>
      <LinearGradient colors={['rgba(212,175,55,0.1)', 'rgba(8,8,10,0.98)']} style={StyleSheet.absoluteFill} />
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPh]}>
          <Ionicons name="diamond-outline" size={22} color={colors.gold} />
        </View>
      )}
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.displayTitle ?? item.title}
      </Text>
      <Text style={styles.meta}>Qty {qty} · Start {start}</Text>
      {reserve ? <Text style={styles.metaSub}>Reserve {reserve}</Text> : null}
      {bin ? <Text style={styles.metaSub}>Buy now {bin}</Text> : null}
      <View style={styles.statusChip}>
        <Text style={styles.statusChipTxt}>{queueStatusLabel(item.status)}</Text>
      </View>
      {!roomEnded ? (
        <View style={styles.cardActions}>
          <QueueSaleTypePill item={item} compact inline />
          {canEdit && onEdit ? (
            <Pressable style={styles.editBtn} disabled={busy} onPress={() => onEdit(item)}>
              <Text style={styles.editBtnTxt}>Edit</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.pinBtn, (!roomLive || busy) && styles.pinBtnDisabled]}
            disabled={!roomLive || busy}
            onPress={() => onPin(item)}
          >
            <Text style={styles.pinBtnTxt}>Pin</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} disabled={busy} onPress={() => onRemove(item)}>
            <Ionicons name="trash-outline" size={16} color="#FF6B6B" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { gap: spacing.sm, paddingRight: spacing.md, paddingVertical: 2 },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  emptyBody: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 17 },
  emptyAdd: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  emptyAddTxt: { fontWeight: '900', fontSize: 13, color: '#0a0a0a' },
  card: {
    width: SELLER_QUEUE_STRIP_CARD_W,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.28)',
    overflow: 'hidden',
    padding: spacing.sm,
    gap: 4,
  },
  thumb: { width: '100%', height: 72, borderRadius: radii.md, backgroundColor: 'rgba(0,0,0,0.35)' },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.textPrimary, minHeight: 34 },
  meta: { fontSize: 11, fontWeight: '700', color: colors.gold },
  metaSub: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
  statusChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statusChipTxt: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  editBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  editBtnTxt: { fontWeight: '800', fontSize: 11, color: colors.gold },
  pinBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  pinBtnDisabled: { opacity: 0.45 },
  pinBtnTxt: { fontWeight: '900', fontSize: 12, color: '#0a0a0a' },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
