import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThreadDetail } from '../../types/messages';
import { colors, radii, spacing } from '../../theme';

/**
 * Per-quick-action styling — distinct icon + color per destination so the row reads as a set of
 * different shortcuts at a glance, not three copies of the same gold pill.
 */
const QUICK_ACTIONS = {
  offer: { icon: 'cash-outline', label: 'Offer', color: colors.gold, tint: 'rgba(212,175,55,0.10)' },
  order: { icon: 'receipt-outline', label: 'Order', color: colors.success, tint: 'rgba(52,199,89,0.10)' },
  live: { icon: 'radio-outline', label: 'Live', color: colors.live, tint: 'rgba(255,59,48,0.10)' },
} as const;

export function MessageContextBanner({
  thread,
  onViewListing,
  onQuickAction,
}: {
  thread: ThreadDetail;
  onViewListing?: () => void;
  onQuickAction?: (action: string) => void;
}) {
  const thumb = thread.thumbnailUrl?.trim();
  const hasQuickActions = Boolean(thread.offerId || thread.orderId || thread.liveRoomId);

  return (
    <View style={styles.wrap}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.android} />
      )}
      {/* Whole card is the primary "view listing" tap target — no separate Listing chip needed,
          which used to repeat the subline text right below itself. */}
      <Pressable
        onPress={onViewListing}
        accessibilityRole="button"
        accessibilityLabel={`View listing: ${thread.contextHeadline}`}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPh]}>
            <Ionicons name="pricetag-outline" size={22} color={colors.gold} />
          </View>
        )}
        <View style={styles.text}>
          <Text style={styles.eyebrow}>Conversation about</Text>
          <Text style={styles.headline} numberOfLines={2}>
            {thread.contextHeadline}
          </Text>
          {thread.contextSubline ? (
            <Text style={styles.sub} numberOfLines={1}>
              {thread.contextSubline}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
      </Pressable>
      {hasQuickActions ? (
        <View style={styles.actions}>
          {thread.offerId ? <QuickAction kind="offer" onPress={() => onQuickAction?.('offer')} /> : null}
          {thread.orderId ? <QuickAction kind="order" onPress={() => onQuickAction?.('order')} /> : null}
          {thread.liveRoomId ? <QuickAction kind="live" onPress={() => onQuickAction?.('live')} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function QuickAction({ kind, onPress }: { kind: keyof typeof QUICK_ACTIONS; onPress: () => void }) {
  const { icon, label, color, tint } = QUICK_ACTIONS[kind];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, { backgroundColor: tint, borderColor: color }, pressed && styles.actionPressed]}
    >
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[styles.actionTxt, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
  android: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,9,11,0.94)' },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  rowPressed: { opacity: 0.7 },
  thumb: {
    width: 56,
    height: 68,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, fontWeight: '800', color: colors.gold, letterSpacing: 1.1, textTransform: 'uppercase' },
  headline: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginTop: 3, lineHeight: 19 },
  sub: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 3 },
  chevron: { marginLeft: 2 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionPressed: { opacity: 0.7 },
  actionTxt: { fontSize: 11, fontWeight: '800' },
});
