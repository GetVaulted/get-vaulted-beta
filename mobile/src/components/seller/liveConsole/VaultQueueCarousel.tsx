import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { colors, radii, spacing } from '../../../theme';
import { lc } from './liveConsoleTheme';

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${n}`;
}

function statusChip(status: LiveRoomItemRow['status']): { label: string; tone: 'gold' | 'muted' | 'live' } {
  if (status === 'active') return { label: 'On air', tone: 'live' };
  if (status === 'sold') return { label: 'Sold', tone: 'gold' };
  if (status === 'skipped') return { label: 'Skipped', tone: 'muted' };
  return { label: 'Queued', tone: 'muted' };
}

export function VaultQueueCarousel({
  items,
  roomEnded,
  roomLive = false,
  busy,
  onPin,
  onRemove,
}: {
  items: LiveRoomItemRow[];
  roomEnded: boolean;
  roomLive: boolean;
  busy: boolean;
  onPin: (item: LiveRoomItemRow) => void;
  onRemove: (item: LiveRoomItemRow) => void;
}) {
  const queued = items.filter((i) => i.status === 'queued');

  if (queued.length === 0) {
    return (
      <Text style={styles.empty}>Vault queue is empty — quick-add inventory or pull from listings.</Text>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {queued.map((item) => {
        const chip = statusChip(item.status);
        const thumb = item.imageUrl?.trim();
        const hasReserve = item.priceUsd != null;
        return (
          <View key={item.id} style={styles.card}>
            <LinearGradient
              colors={['rgba(212,175,55,0.08)', 'rgba(8,8,10,0.98)']}
              style={StyleSheet.absoluteFill}
            />
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPh]}>
                <Ionicons name="image-outline" size={22} color={colors.textMuted} />
              </View>
            )}
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.displayTitle ?? item.title}
            </Text>
            <Text style={styles.bid}>Start {fmtMoney(item.startingBidUsd ?? 1)}</Text>
            <View style={styles.tagRow}>
              <Text style={styles.tag}>{hasReserve ? 'Reserve' : 'No reserve'}</Text>
              <Text style={styles.tag}>Auction</Text>
            </View>
            <View style={[styles.chip, chip.tone === 'live' && styles.chipLive]}>
              <Text style={styles.chipTxt}>{chip.label}</Text>
            </View>
            {!roomEnded ? (
              <View style={styles.cardActions}>
                <Pressable
                  style={[styles.pinBtn, (!roomLive || busy) && styles.pinBtnDisabled]}
                  disabled={!roomLive || busy}
                  onPress={() => onPin(item)}
                >
                  <Text style={styles.pinTxt}>Pin</Text>
                </Pressable>
                <Pressable style={styles.trash} disabled={busy} onPress={() => onRemove(item)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color="#FF6B6B" />
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { gap: spacing.sm, paddingRight: spacing.md },
  empty: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  card: {
    width: 168,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.22)',
    overflow: 'hidden',
    padding: spacing.sm,
    gap: 6,
  },
  thumb: { width: '100%', height: 92, borderRadius: radii.md, backgroundColor: 'rgba(0,0,0,0.35)' },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary, minHeight: 36 },
  bid: { fontSize: 13, fontWeight: '700', color: colors.gold },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: { fontSize: 9, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipLive: { backgroundColor: colors.liveGlow },
  chipTxt: { fontSize: 9, fontWeight: '800', color: colors.textSecondary },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  pinBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
  },
  pinBtnDisabled: { opacity: 0.45 },
  pinTxt: { fontWeight: '800', fontSize: 12, color: '#0a0a0a' },
  trash: { padding: 6 },
});
