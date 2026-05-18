import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThreadListItem } from '../../types/messages';
import { colors, radii, spacing } from '../../theme';

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function MessageThreadCard({ thread, onPress }: { thread: ThreadListItem; onPress: () => void }) {
  const avatar =
    thread.otherAvatarUrl?.trim() ||
    `https://i.pravatar.cc/96?u=${encodeURIComponent(thread.otherUsername)}`;
  const thumb = thread.thumbnailUrl?.trim();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.androidGlass} />
      )}
      <View style={styles.row}>
        <View style={styles.avatarCol}>
          <Image source={{ uri: avatar }} style={styles.avatar} />
          {thread.unreadCount > 0 ? <View style={styles.unreadDot} /> : null}
        </View>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPh]}>
            <Ionicons name="diamond-outline" size={18} color={colors.gold} />
          </View>
        )}
        <View style={styles.body}>
          <View style={styles.top}>
            <Text style={styles.user} numberOfLines={1}>
              @{thread.otherUsername}
            </Text>
            <Text style={styles.time}>{formatTime(thread.lastAt)}</Text>
          </View>
          <Text style={styles.context} numberOfLines={1}>
            {thread.contextHeadline}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.kind}>{thread.conversationLabel}</Text>
            {thread.offerStatus ? <Text style={styles.chip}>{thread.offerStatus}</Text> : null}
            {thread.orderStatus ? <Text style={styles.chip}>{thread.orderStatus}</Text> : null}
            {thread.pinned ? <Ionicons name="pin" size={11} color={colors.gold} /> : null}
            {thread.starred ? <Ionicons name="star" size={11} color={colors.gold} /> : null}
          </View>
          <Text style={[styles.preview, thread.unreadCount > 0 && styles.previewUnread]} numberOfLines={2}>
            {thread.lastPreview || '—'}
          </Text>
        </View>
        {thread.unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{thread.unreadCount > 9 ? '9+' : thread.unreadCount}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.22)',
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
  androidGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,13,16,0.92)',
  },
  row: { flexDirection: 'row', padding: spacing.sm, gap: spacing.sm, alignItems: 'flex-start' },
  avatarCol: { position: 'relative' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  unreadDot: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.live,
    borderWidth: 2,
    borderColor: '#0a0a0a',
  },
  thumb: {
    width: 44,
    height: 52,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  user: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  time: { fontSize: 10, fontWeight: '600', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  context: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.88)' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  kind: { fontSize: 9, fontWeight: '700', color: colors.gold, letterSpacing: 0.4, textTransform: 'uppercase' },
  chip: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  preview: { fontSize: 12, lineHeight: 16, color: colors.textMuted, marginTop: 2 },
  previewUnread: { color: colors.textSecondary, fontWeight: '600' },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    alignSelf: 'center',
  },
  badgeTxt: { fontSize: 10, fontWeight: '900', color: '#0a0a0a' },
});
