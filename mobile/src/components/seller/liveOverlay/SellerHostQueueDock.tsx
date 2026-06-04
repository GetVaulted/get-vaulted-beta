import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { logSellerQueue } from '../../../lib/logSellerQueue';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { colors, radii, spacing } from '../../../theme';
import { SellerQueueStrip } from './SellerQueueStrip';

/** Always-visible Whatnot-style queue dock — fixed height, not inside a parent ScrollView. */
export const SELLER_QUEUE_DOCK_HEIGHT = 178;

export function SellerHostQueueDock({
  bottom,
  left,
  right,
  items,
  activeItem,
  queuedCount,
  loading,
  busy,
  roomEnded,
  onAddItem,
  onExpandLineup,
  onStart,
  onEdit,
  onRemove,
}: {
  bottom: number;
  left: number;
  right: number;
  items: LiveRoomItemRow[];
  activeItem: LiveRoomItemRow | null;
  queuedCount: number;
  loading: boolean;
  busy: boolean;
  roomEnded: boolean;
  onAddItem: () => void;
  onExpandLineup: () => void;
  onStart: (item: LiveRoomItemRow) => void;
  onEdit?: (item: LiveRoomItemRow) => void;
  onRemove: (item: LiveRoomItemRow) => void;
}) {
  const queued = items.filter((i) => i.status === 'queued');
  const renderMode = loading ? 'loading' : queued.length > 0 ? 'strip' : 'empty';

  useEffect(() => {
    logSellerQueue('queue_length', {
      total: items.length,
      queued: queued.length,
      queuedCount,
    });
    logSellerQueue('render_mode', { renderMode, loading, roomEnded });
    logSellerQueue('active_item', {
      id: activeItem?.id ?? null,
      title: activeItem?.title?.slice(0, 48) ?? null,
      status: activeItem?.status ?? null,
    });
  }, [items.length, queued.length, queuedCount, renderMode, loading, roomEnded, activeItem?.id, activeItem?.status, activeItem?.title]);

  return (
    <View style={[styles.host, { bottom, left, right, height: SELLER_QUEUE_DOCK_HEIGHT }]} pointerEvents="box-none">
      <View style={styles.panel} pointerEvents="auto">
        {Platform.OS === 'ios' ? (
          <BlurView intensity={32} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.androidGlass} />
        )}
        <View style={styles.inner}>
          <View style={styles.headRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headTitle}>Queue</Text>
              <Text style={styles.headSub}>
                {loading ? 'Syncing…' : `${queuedCount} waiting`}
                {activeItem ? ` · On air: ${(activeItem.displayTitle ?? activeItem.title).slice(0, 28)}` : ''}
              </Text>
            </View>
            {!roomEnded ? (
              <Pressable style={styles.addBtn} onPress={onAddItem} disabled={busy} accessibilityLabel={SELLER_CONSOLE.addItem}>
                <Ionicons name="add" size={18} color="#0a0a0a" />
                <Text style={styles.addBtnTxt}>Add</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.expandBtn} onPress={onExpandLineup} hitSlop={8} accessibilityLabel="Expand lineup">
              <Ionicons name="expand-outline" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.stripHost}>
            {loading ? (
              <ActivityIndicator color={colors.gold} style={styles.loader} />
            ) : (
              <SellerQueueStrip
                items={items}
                roomEnded={roomEnded}
                busy={busy}
                onStart={onStart}
                onEdit={onEdit}
                onRemove={onRemove}
                onAddItem={onAddItem}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    zIndex: 16,
  },
  panel: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  androidGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,10,0.92)',
  },
  inner: {
    flex: 1,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headTitle: { fontSize: 14, fontWeight: '900', color: colors.textPrimary },
  headSub: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginTop: 1 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    minHeight: 36,
  },
  addBtnTxt: { fontWeight: '900', fontSize: 12, color: '#0a0a0a' },
  expandBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  stripHost: {
    flex: 1,
    minHeight: 0,
  },
  loader: { flex: 1, alignSelf: 'center' },
});
