import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  fetchPriorLiveRoomsForCopy,
  moveSoldSpotsFromRoom,
  previewMoveSoldSpots,
  type MoveSoldSpotsPreview,
  type PriorLiveRoomOption,
} from '../../../api/liveRoomControlRepository';
import { colors, radii, spacing, vaultColors } from '../../../theme';

/**
 * "Move sold spots": carries lots that already have sold spots (and their buyers) from an ENDED show
 * into this show, so a break can be finished across two shows. Nothing is copied — the lots and
 * purchases move, so nothing is counted twice. Two steps: pick lots, then review and confirm.
 */
export function MoveSoldSpotsPanel({
  accessToken,
  roomId,
  busy,
  onMoved,
}: {
  accessToken: string;
  roomId: string;
  busy?: boolean;
  onMoved: (result: { items: number; sourceTitle?: string }) => void;
}) {
  const [rooms, setRooms] = useState<PriorLiveRoomOption[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [lots, setLots] = useState<MoveSoldSpotsPreview['items']>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [review, setReview] = useState<MoveSoldSpotsPreview | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = Boolean(busy) || working;

  useEffect(() => {
    if (!accessToken.trim() || !roomId.trim()) return;
    let cancelled = false;
    setRoomsLoading(true);
    setError(null);
    void fetchPriorLiveRoomsForCopy(accessToken, roomId)
      .then((all) => {
        if (cancelled) return;
        // Only shows that have ended can give up their sold spots.
        setRooms(all.filter((r) => r.status === 'ended'));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load your past shows.');
        setRooms([]);
      })
      .finally(() => {
        if (!cancelled) setRoomsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, roomId]);

  const chooseShow = (id: string) => {
    if (locked || id === sourceId) return;
    setSourceId(id);
    setPickedIds([]);
    setReview(null);
    setLots([]);
    setError(null);
    setLotsLoading(true);
    void previewMoveSoldSpots(accessToken, roomId, id, [])
      .then((p) => setLots(p.items.filter((i) => i.paidSpots > 0)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load that show.'))
      .finally(() => setLotsLoading(false));
  };

  const togglePick = (id: string) => {
    if (locked) return;
    setReview(null);
    setPickedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const reviewMove = () => {
    if (locked || !sourceId || pickedIds.length === 0) return;
    setWorking(true);
    setError(null);
    void previewMoveSoldSpots(accessToken, roomId, sourceId, pickedIds)
      .then(setReview)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not review that move.'))
      .finally(() => setWorking(false));
  };

  const confirmMove = () => {
    if (locked || !review || review.blockers.length > 0) return;
    setWorking(true);
    setError(null);
    void moveSoldSpotsFromRoom(accessToken, roomId, sourceId, pickedIds, review.totals)
      .then((r) => onMoved({ items: r.moved.items, sourceTitle: r.sourceTitle ?? review.from.title }))
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not move the spots. Nothing was changed.');
        // Re-check so the numbers on screen match what is true now.
        setReview(null);
      })
      .finally(() => setWorking(false));
  };

  return (
    <>
      <Text style={styles.sub}>
        Finish a break across two shows. Pick a show that has ended and the lots whose spots already sold. They move
        here with their buyers, nothing is copied or charged again, and buyers' shipping carries over.
      </Text>

      {roomsLoading ? <ActivityIndicator color={vaultColors.gold} style={{ marginVertical: 12 }} /> : null}
      {!roomsLoading && rooms.length === 0 && !error ? (
        <Text style={styles.sub}>You have no ended shows to move spots from.</Text>
      ) : null}

      {rooms.length > 0 ? <Text style={styles.lbl}>1 · Show to move from</Text> : null}
      {rooms.map((room) => {
        const on = sourceId === room.id;
        return (
          <Pressable
            key={room.id}
            style={[styles.row, on && styles.rowOn]}
            onPress={() => chooseShow(room.id)}
            disabled={locked}
          >
            <View style={styles.meta}>
              <Text style={styles.title} numberOfLines={2}>
                {room.title || 'Untitled show'}
              </Text>
              <Text style={styles.small}>Ended</Text>
            </View>
            <Ionicons
              name={on ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={on ? vaultColors.gold : colors.textMuted}
            />
          </Pressable>
        );
      })}

      {sourceId ? <Text style={styles.lbl}>2 · Lots with sold spots</Text> : null}
      {lotsLoading ? <ActivityIndicator color={vaultColors.gold} style={{ marginVertical: 12 }} /> : null}
      {sourceId && !lotsLoading && lots.length === 0 && !error ? (
        <Text style={styles.sub}>This show has no lots with sold spots. Use Copy last show for lots that did not sell.</Text>
      ) : null}
      {lots.map((lot) => {
        const on = pickedIds.includes(lot.id);
        return (
          <Pressable
            key={lot.id}
            style={[styles.row, on && styles.rowOn]}
            onPress={() => togglePick(lot.id)}
            disabled={locked}
          >
            <View style={styles.meta}>
              <Text style={styles.title} numberOfLines={2}>
                {lot.title || 'Untitled lot'}
              </Text>
              <Text style={styles.small}>
                {lot.paidSpots} sold spot{lot.paidSpots === 1 ? '' : 's'}
                {lot.pendingSpots > 0 ? ` · ${lot.pendingSpots} waiting on payment` : ''}
              </Text>
            </View>
            <Ionicons
              name={on ? 'checkbox' : 'square-outline'}
              size={22}
              color={on ? vaultColors.gold : colors.textMuted}
            />
          </Pressable>
        );
      })}

      {error ? <Text style={styles.err}>{error}</Text> : null}

      {review ? (
        <View style={styles.reviewBox}>
          <Text style={styles.reviewTitle}>
            Moving {review.totals.items} lot{review.totals.items === 1 ? '' : 's'} · {review.totals.paidSpots} sold
            spot{review.totals.paidSpots === 1 ? '' : 's'} · {review.totals.buyers} buyer
            {review.totals.buyers === 1 ? '' : 's'}
          </Text>
          <Text style={styles.small}>
            From "{review.from.title || 'Untitled show'}" to "{review.to.title || 'this show'}".
          </Text>
          {review.buyers.slice(0, 8).map((b) => (
            <Text key={b.username} style={styles.small}>
              @{b.username} · {b.spots} spot{b.spots === 1 ? '' : 's'}
            </Text>
          ))}
          {review.buyers.length > 8 ? <Text style={styles.small}>and {review.buyers.length - 8} more</Text> : null}
          {review.blockers.map((b) => (
            <Text key={b} style={styles.err}>
              {b}
            </Text>
          ))}
          {review.warnings.map((w) => (
            <Text key={w} style={styles.warn}>
              {w}
            </Text>
          ))}
          <Text style={styles.small}>This moves the lots out of the old show. It can't be undone from the app.</Text>
        </View>
      ) : null}

      {!review ? (
        <Pressable
          style={[styles.primary, (locked || pickedIds.length === 0) && styles.primaryOff]}
          onPress={reviewMove}
          disabled={locked || pickedIds.length === 0}
        >
          <Text style={styles.primaryTxt}>
            {working ? 'Checking…' : pickedIds.length === 0 ? 'Pick lots to review' : `Review ${pickedIds.length} lot${pickedIds.length === 1 ? '' : 's'}`}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.primary, (locked || review.blockers.length > 0) && styles.primaryOff]}
          onPress={confirmMove}
          disabled={locked || review.blockers.length > 0}
        >
          <Text style={styles.primaryTxt}>
            {working ? 'Moving…' : `Move ${review.totals.paidSpots} sold spot${review.totals.paidSpots === 1 ? '' : 's'} here`}
          </Text>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs },
  lbl: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  rowOn: { borderColor: 'rgba(203,163,92,0.45)', backgroundColor: 'rgba(203,163,92,0.1)' },
  meta: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  small: { marginTop: 2, fontSize: 11, color: colors.textMuted },
  err: { fontSize: 12, color: '#fca5a5', marginTop: 4 },
  warn: { fontSize: 12, color: '#fcd34d', marginTop: 4 },
  reviewBox: {
    gap: 2,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(203,163,92,0.3)',
    backgroundColor: 'rgba(203,163,92,0.06)',
  },
  reviewTitle: { fontSize: 14, fontWeight: '900', color: colors.textPrimary },
  primary: {
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: vaultColors.gold,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryOff: { opacity: 0.55 },
  primaryTxt: { fontWeight: '900', color: '#0a0a0a', fontSize: 15 },
});
