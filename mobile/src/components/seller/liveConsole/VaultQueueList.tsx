import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { colors, radii, spacing } from '../../../theme';

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${n}`;
}

export function VaultQueueList({
  items,
  roomType,
  roomEnded,
  busy,
  onLaunch,
  onRemove,
  onReorder,
}: {
  items: LiveRoomItemRow[];
  roomType: 'auction' | 'sale' | 'break';
  roomEnded: boolean;
  busy: boolean;
  onLaunch: (item: LiveRoomItemRow) => void;
  onRemove: (item: LiveRoomItemRow) => void;
  onReorder: (ordered: LiveRoomItemRow[]) => void;
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
      renderItem={({ item, drag, isActive }: RenderItemParams<LiveRoomItemRow>) => (
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
                {item.title}
              </Text>
              <Text style={styles.bid}>Bid {fmtMoney(item.currentBidUsd ?? item.startingBidUsd)}</Text>
              <View style={styles.tagRow}>
                <Text style={styles.tag}>{auctionLabel}</Text>
                <Text style={styles.tag}>{item.priceUsd != null ? 'Reserve' : 'Open'}</Text>
                <Text style={styles.tag}>— watching</Text>
              </View>
            </View>
            {!roomEnded ? (
              <View style={styles.actions}>
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
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 200 },
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
  bid: { fontSize: 12, fontWeight: '700', color: colors.gold, marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tag: { fontSize: 9, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  actions: { alignItems: 'flex-end', gap: 8 },
  launch: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  launchTxt: { fontSize: 11, fontWeight: '800', color: '#0a0a0a' },
});
