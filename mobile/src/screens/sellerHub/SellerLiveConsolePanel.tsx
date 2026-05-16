import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createLiveRoomQueueItem,
  deleteLiveRoomQueueItem,
  fetchLiveRoomDetailWithItems,
  patchLiveRoomItem,
  type LiveRoomItemRow,
} from '../../api/liveRoomControlRepository';
import { colors, radii, spacing } from '../../theme';

const DEFAULT_AUCTION_SEC = 15;

function statusLabel(s: LiveRoomItemRow['status']): string {
  if (s === 'active') return 'On screen';
  if (s === 'sold') return 'Sold';
  if (s === 'skipped') return 'Skipped';
  return 'Queued';
}

export function SellerLiveConsolePanel({
  accessToken,
  roomId,
  roomStatus,
  roomType,
}: {
  accessToken: string;
  roomId: string;
  roomStatus: 'scheduled' | 'live' | 'ended';
  roomType: 'auction' | 'sale' | 'break';
}) {
  const [items, setItems] = useState<LiveRoomItemRow[]>([]);
  const [activeItem, setActiveItem] = useState<LiveRoomItemRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [consoleError, setConsoleError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setConsoleError(null);
    const detail = await fetchLiveRoomDetailWithItems(accessToken, roomId);
    setItems(detail.items);
    setActiveItem(detail.activeItem);
  }, [accessToken, roomId]);

  const loadOnce = useCallback(async () => {
    setLoading(true);
    try {
      await reload();
    } catch (e) {
      setConsoleError(e instanceof Error ? e.message : 'Could not load show queue.');
    } finally {
      setLoading(false);
    }
  }, [reload]);

  useEffect(() => {
    void loadOnce();
  }, [loadOnce]);

  const run = async (fn: () => Promise<void>) => {
    if (busy || roomStatus === 'ended') return;
    setBusy(true);
    setConsoleError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Action failed.';
      setConsoleError(msg);
      Alert.alert('Show control', msg);
    } finally {
      setBusy(false);
    }
  };

  const onAddItem = () => {
    const title = newTitle.trim();
    if (!title) {
      Alert.alert('Title required', 'Enter a lot title for the queue.');
      return;
    }
    void run(async () => {
      await createLiveRoomQueueItem(accessToken, roomId, { title });
      setNewTitle('');
    });
  };

  const onSetActive = (item: LiveRoomItemRow) => {
    void run(async () => {
      await patchLiveRoomItem(accessToken, roomId, item.id, { status: 'active' });
    });
  };

  const onStartBidding = () => {
    if (!activeItem) return;
    void run(async () => {
      await patchLiveRoomItem(accessToken, roomId, activeItem.id, {
        action: 'startAuction',
        auctionDurationSec: DEFAULT_AUCTION_SEC,
        clutchTimeEnabled: false,
      });
    });
  };

  const onMarkSold = () => {
    if (!activeItem) return;
    void run(async () => {
      await patchLiveRoomItem(accessToken, roomId, activeItem.id, { status: 'sold' });
    });
  };

  const onSkip = () => {
    if (!activeItem) return;
    void run(async () => {
      await patchLiveRoomItem(accessToken, roomId, activeItem.id, { status: 'skipped' });
    });
  };

  const onDeleteQueued = (item: LiveRoomItemRow) => {
    Alert.alert('Remove lot?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void run(async () => {
            await deleteLiveRoomQueueItem(accessToken, roomId, item.id);
          });
        },
      },
    ]);
  };

  const auctionRoom = roomType === 'auction' || roomType === 'break';

  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>4 · Show control</Text>
        <Pressable onPress={() => void loadOnce()} hitSlop={8} disabled={loading || busy}>
          <Text style={s.refresh}>{loading ? '…' : 'Refresh'}</Text>
        </Pressable>
      </View>
      <Text style={s.cardBody}>
        Run your show from here — same queue and bidding controls as Seller Live on web. Stream setup is optional
        above.
      </Text>

      {consoleError ? <Text style={s.err}>{consoleError}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.sm }} />
      ) : (
        <>
          {activeItem ? (
            <View style={s.activeBox}>
              <Text style={s.activeLabel}>On screen now</Text>
              <Text style={s.activeTitle}>{activeItem.title}</Text>
              <Text style={s.activeMeta}>
                {activeItem.biddingOpen ? 'Bidding open' : 'Bidding not started'}
                {activeItem.currentBidUsd != null ? ` · $${activeItem.currentBidUsd}` : ''}
              </Text>
              {roomStatus === 'live' ? (
                <View style={s.btnRow}>
                  {auctionRoom && !activeItem.biddingOpen ? (
                    <Pressable style={s.btnGoldSm} disabled={busy} onPress={onStartBidding}>
                      <Text style={s.btnGoldSmTxt}>Start bidding</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={s.btnOutlineSm} disabled={busy} onPress={onMarkSold}>
                    <Text style={s.btnOutlineSmTxt}>Mark sold</Text>
                  </Pressable>
                  <Pressable style={s.btnOutlineSm} disabled={busy} onPress={onSkip}>
                    <Text style={s.btnOutlineSmTxt}>Skip</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={s.hint}>Tap Go live above before starting lots.</Text>
              )}
            </View>
          ) : (
            <Text style={s.hint}>No active lot — tap a queued item to put it on screen.</Text>
          )}

          <Text style={s.fieldLabel}>Add to queue</Text>
          <TextInput
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="Lot title"
            placeholderTextColor={colors.textMuted}
            style={s.input}
            editable={roomStatus !== 'ended' && !busy}
          />
          <Pressable
            style={[s.btnOutline, roomStatus === 'ended' && s.disabled]}
            disabled={busy || roomStatus === 'ended'}
            onPress={onAddItem}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.gold} />
            <Text style={s.btnOutlineSmTxt}>Add lot</Text>
          </Pressable>

          <Text style={[s.fieldLabel, { marginTop: spacing.md }]}>Queue ({items.length})</Text>
          {items.length === 0 ? (
            <Text style={s.hint}>No lots yet. Add items here or from Seller Live on web — they stay in sync.</Text>
          ) : (
            items.map((item) => {
              const isActive = item.status === 'active';
              return (
                <View key={item.id} style={[s.queueRow, isActive && s.queueRowActive]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.queueTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={s.queueMeta}>{statusLabel(item.status)}</Text>
                  </View>
                  {item.status === 'queued' && roomStatus !== 'ended' ? (
                    <View style={s.queueActions}>
                      <Pressable style={s.iconBtn} disabled={busy} onPress={() => onSetActive(item)}>
                        <Text style={s.iconBtnTxt}>Show</Text>
                      </Pressable>
                      <Pressable style={s.iconBtnDanger} disabled={busy} onPress={() => onDeleteQueued(item)}>
                        <Ionicons name="trash-outline" size={16} color="#FF6B6B" />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  refresh: { fontSize: 13, fontWeight: '600', color: colors.gold },
  cardBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  err: { color: '#FF6B6B', fontSize: 13 },
  fieldLabel: {
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  activeBox: {
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
    gap: 6,
  },
  activeLabel: { fontSize: 11, fontWeight: '700', color: colors.gold, textTransform: 'uppercase' },
  activeTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  activeMeta: { fontSize: 13, color: colors.textMuted },
  hint: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  btnGoldSm: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
  },
  btnGoldSmTxt: { color: '#0a0a0a', fontWeight: '700', fontSize: 13 },
  btnOutlineSm: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnOutlineSmTxt: { color: colors.textPrimary, fontWeight: '600', fontSize: 13 },
  btnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: { opacity: 0.5 },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  queueRowActive: { backgroundColor: 'rgba(212,175,55,0.06)' },
  queueTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  queueMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  queueActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
  },
  iconBtnTxt: { fontSize: 12, fontWeight: '700', color: colors.gold },
  iconBtnDanger: { padding: 6 },
});
