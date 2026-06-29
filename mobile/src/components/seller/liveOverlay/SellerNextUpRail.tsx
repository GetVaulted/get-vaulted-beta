import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { formatUsdDisplay, queueItemQuantity } from '../../../lib/liveAuctionPricing';
import { logSellerQueue } from '../../../lib/logSellerQueue';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { colors, radii, spacing } from '../../../theme';

/** Compact Whatnot-style “next up” bar — full queue opens in sheet only. */
export const SELLER_NEXT_UP_RAIL_HEIGHT = 52;

export function SellerNextUpRail({
  bottom,
  left,
  right,
  items,
  queuedCount,
  loading,
  busy,
  roomEnded,
  onOpenQueue,
  onAddItem,
}: {
  bottom: number;
  left: number;
  right: number;
  items: LiveRoomItemRow[];
  queuedCount: number;
  loading: boolean;
  busy: boolean;
  roomEnded: boolean;
  onOpenQueue: () => void;
  onAddItem: () => void;
}) {
  const nextQueued = items.find((i) => i.status === 'queued') ?? null;

  useEffect(() => {
    logSellerQueue('queue_length', { total: items.length, queued: queuedCount });
    logSellerQueue('render_mode', {
      renderMode: 'next_up_rail',
      loading,
      hasNext: Boolean(nextQueued),
    });
  }, [items.length, queuedCount, loading, nextQueued?.id]);

  const nextLabel = loading
    ? 'Loading queue…'
    : nextQueued
      ? (nextQueued.displayTitle ?? nextQueued.title).trim()
      : 'No lots queued';
  const nextMeta = nextQueued
    ? `Qty ${queueItemQuantity(nextQueued)} · ${formatUsdDisplay(nextQueued.startingBidUsd ?? 1)}`
    : roomEnded
      ? 'Show ended'
      : 'Tap Queue to manage';

  return (
    <View
      style={[styles.host, { bottom, left, right, height: SELLER_NEXT_UP_RAIL_HEIGHT }]}
      pointerEvents="box-none"
    >
      <View style={styles.panel} pointerEvents="auto">
        {Platform.OS === 'ios' ? (
          <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.androidGlass} />
        )}
        <View style={styles.row}>
          <Pressable
            style={styles.nextCol}
            onPress={onOpenQueue}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={`Next up: ${nextLabel}`}
          >
            <Text style={styles.eyebrow}>Next up</Text>
            <Text style={styles.nextTitle} numberOfLines={1}>
              {nextLabel}
            </Text>
            <Text style={styles.nextMeta} numberOfLines={1}>
              {nextMeta}
            </Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable
              style={styles.queueBtn}
              onPress={onOpenQueue}
              hitSlop={6}
              accessibilityLabel={`${SELLER_CONSOLE.lineup}, ${queuedCount} waiting`}
            >
              <Ionicons name="layers-outline" size={15} color={colors.gold} />
              <Text style={styles.queueBtnTxt}>Queue</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{loading ? '…' : String(queuedCount)}</Text>
              </View>
            </Pressable>
            {!roomEnded ? (
              <Pressable
                style={styles.addBtn}
                onPress={onAddItem}
                disabled={busy}
                hitSlop={6}
                accessibilityLabel={SELLER_CONSOLE.addItem}
              >
                <Ionicons name="add" size={18} color="#0a0a0a" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    zIndex: 15,
  },
  panel: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  androidGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,10,0.88)',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: spacing.sm,
  },
  nextCol: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  nextTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 1,
  },
  nextMeta: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.gold,
    marginTop: 1,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  queueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    minHeight: 36,
  },
  queueBtnTxt: { fontSize: 12, fontWeight: '800', color: colors.textPrimary },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeTxt: { fontSize: 10, fontWeight: '900', color: '#0a0a0a' },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
