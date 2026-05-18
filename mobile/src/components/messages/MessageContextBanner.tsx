import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThreadDetail } from '../../types/messages';
import { colors, radii, spacing } from '../../theme';

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

  return (
    <View style={styles.wrap}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.android} />
      )}
      <View style={styles.row}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPh]}>
            <Ionicons name="pricetag-outline" size={20} color={colors.gold} />
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
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={onViewListing}>
          <Ionicons name="cube-outline" size={14} color={colors.gold} />
          <Text style={styles.actionTxt}>Listing</Text>
        </Pressable>
        {thread.offerId ? (
          <Pressable style={styles.action} onPress={() => onQuickAction?.('offer')}>
            <Ionicons name="cash-outline" size={14} color={colors.gold} />
            <Text style={styles.actionTxt}>Offer</Text>
          </Pressable>
        ) : null}
        {thread.orderId ? (
          <Pressable style={styles.action} onPress={() => onQuickAction?.('order')}>
            <Ionicons name="cube-outline" size={14} color={colors.gold} />
            <Text style={styles.actionTxt}>Order</Text>
          </Pressable>
        ) : null}
        {thread.liveRoomId ? (
          <Pressable style={styles.action} onPress={() => onQuickAction?.('live')}>
            <Ionicons name="radio-outline" size={14} color={colors.gold} />
            <Text style={styles.actionTxt}>Live</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.28)',
  },
  android: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,11,14,0.9)' },
  row: { flexDirection: 'row', padding: spacing.sm, gap: spacing.sm },
  thumb: { width: 52, height: 62, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.35)' },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 9, fontWeight: '700', color: colors.gold, letterSpacing: 0.6, textTransform: 'uppercase' },
  headline: { fontSize: 14, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  sub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  actionTxt: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
});
