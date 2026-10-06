import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatInboxTime, inboxPreviewText } from '../../lib/messageDisplay';
import type { ThreadListItem } from '../../types/messages';
import { colors, spacing } from '../../theme';
import { vaultFonts } from '../../theme/vaultTypography';
import { UserAvatar } from '../ui/UserAvatar';

/** One person in the inbox: avatar, name, last message and unread count. No listing context. */
export function MessageThreadCard({
  thread,
  onPress,
  showDivider,
  timeText,
}: {
  thread: ThreadListItem;
  onPress: () => void;
  showDivider: boolean;
  /** Replaces the clock/date on the right (the Deleted area shows how many days are left). */
  timeText?: string;
}) {
  const unread = thread.unreadCount > 0;
  const preview = inboxPreviewText(thread.lastPreview) || '—';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${thread.otherUsername}${unread ? `, ${thread.unreadCount} unread` : ''}`}
      style={({ pressed }) => [styles.row, showDivider && styles.divider, pressed && styles.pressed]}
    >
      <UserAvatar
        uri={thread.otherAvatarUrl}
        username={thread.otherUsername}
        size={52}
        cornerRadius={16}
        tone="light"
        borderColor={unread ? 'rgba(212,175,55,0.75)' : 'rgba(212,175,55,0.30)'}
        borderWidth={1.5}
      />
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              @{thread.otherUsername}
            </Text>
            {thread.otherSellerLevelLabel ? (
              <Text style={styles.sellerTag} numberOfLines={1}>
                {thread.otherSellerLevelLabel}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.time, unread && styles.timeUnread]}>{timeText ?? formatInboxTime(thread.lastAt)}</Text>
        </View>
        <View style={styles.bottom}>
          <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
            {preview}
          </Text>
          {unread ? (
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>{thread.unreadCount > 9 ? '9+' : thread.unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  divider: { borderTopWidth: 1, borderTopColor: 'rgba(212,175,55,0.10)' },
  pressed: { backgroundColor: '#0C0B07' },
  body: { flex: 1, minWidth: 0, gap: 3 },
  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flexShrink: 1 },
  sellerTag: {
    fontFamily: vaultFonts.label,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  time: { fontSize: 12, color: '#6E6E6E', fontVariant: ['tabular-nums'] },
  timeUnread: { color: colors.gold },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  preview: { flex: 1, fontSize: 14, color: '#9B9B9B' },
  previewUnread: { color: colors.textPrimary, fontWeight: '600' },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTxt: { fontSize: 12, fontWeight: '600', color: colors.background },
});
