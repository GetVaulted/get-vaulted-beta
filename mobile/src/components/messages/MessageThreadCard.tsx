import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { UserAvatar } from '../ui/UserAvatar';
import type { MessageConversationKind, ThreadListItem } from '../../types/messages';
import { colors, radii, spacing } from '../../theme';

/** Days remaining before a trashed thread is purged for good — clamped so it never reads negative. */
function daysUntil(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    const daysAgo = (now.getTime() - d.getTime()) / 86_400_000;
    if (daysAgo < 6) {
      return d.toLocaleDateString('en-US', { weekday: 'short' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Compact, unobtrusive tag for threads that are about something specific (an offer, an order, a
 * trade) — omitted entirely for plain buyer/seller DMs so most rows read exactly like a clean
 * messaging inbox. Replaces the old always-on product thumbnail + separate uppercase label row +
 * status chip row, which made every single row look "attached to a product" even for a plain chat.
 */
function conversationTagStyle(kind: MessageConversationKind): { label: string; color: string } | null {
  switch (kind) {
    case 'offer_negotiation':
      return { label: 'Offer', color: colors.gold };
    case 'order_support':
      return { label: 'Order', color: colors.success };
    case 'trade':
      return { label: 'Trade', color: colors.mod };
    case 'live_networking':
      return { label: 'Live', color: colors.mention };
    default:
      return null;
  }
}

type Props = {
  thread: ThreadListItem;
  onPress: () => void;
  /** Swipe-left reveals a Delete action (Inbox/Requests rows). Omit in Trash. */
  onDelete?: () => void;
  /** Swipe-left reveals a Restore action instead of Delete (Trash rows). Omit outside Trash. */
  onRestore?: () => void;
};

export function MessageThreadCard({ thread, onPress, onDelete, onRestore }: Props) {
  const unread = thread.unreadCount > 0;
  const tag = conversationTagStyle(thread.conversationKind);
  const statusText = thread.offerStatus || thread.orderStatus;
  const swipeRef = useRef<SwipeableMethods>(null);
  const inTrash = Boolean(onRestore);
  const daysLeft = inTrash ? daysUntil(thread.purgeAt) : 0;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      enabled={Boolean(onDelete || onRestore)}
      renderRightActions={() =>
        inTrash ? (
          <Pressable
            style={[styles.swipeAction, styles.swipeActionRestore]}
            onPress={() => {
              swipeRef.current?.close();
              onRestore?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Restore conversation"
          >
            <Ionicons name="refresh" size={18} color="#0a0a0a" />
            <Text style={styles.swipeActionTxt}>Restore</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.swipeAction, styles.swipeActionDelete]}
            onPress={() => {
              swipeRef.current?.close();
              onDelete?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Delete conversation"
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={[styles.swipeActionTxt, { color: '#fff' }]}>Delete</Text>
          </Pressable>
        )
      }
    >
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <View style={styles.avatarCol}>
          <UserAvatar uri={thread.otherAvatarUrl} username={thread.otherUsername} size={46} />
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>
        <View style={styles.body}>
          <View style={styles.top}>
            <Text style={[styles.user, unread && styles.userUnread]} numberOfLines={1}>
              @{thread.otherUsername}
            </Text>
            <View style={styles.topRight}>
              {thread.pinned ? <Ionicons name="pin" size={11} color={colors.textMuted} /> : null}
              {thread.starred ? <Ionicons name="star" size={11} color={colors.gold} /> : null}
              <Text style={styles.time}>{formatTime(thread.lastAt)}</Text>
            </View>
          </View>
          <View style={styles.previewRow}>
            {tag ? (
              <View style={[styles.tag, { backgroundColor: `${tag.color}1F`, borderColor: `${tag.color}55` }]}>
                <Text style={[styles.tagTxt, { color: tag.color }]}>{statusText || tag.label}</Text>
              </View>
            ) : null}
            <Text
              style={[styles.preview, unread && styles.previewUnread]}
              numberOfLines={tag ? 1 : 2}
            >
              {thread.lastPreview || '—'}
            </Text>
          </View>
        </View>
        {inTrash ? (
          <Text style={styles.purgeTxt}>{daysLeft <= 0 ? 'Today' : `${daysLeft}d`}</Text>
        ) : unread ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{thread.unreadCount > 9 ? '9+' : thread.unreadCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.background,
  },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.03)' },
  avatarCol: { position: 'relative' },
  unreadDot: {
    position: 'absolute',
    right: -1,
    top: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.background,
  },
  body: { flex: 1, minWidth: 0, gap: 3, justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  user: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  userUnread: { color: colors.textPrimary, fontWeight: '800' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  time: { fontSize: 12, fontWeight: '500', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: {
    flexShrink: 0,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagTxt: { fontSize: 10, fontWeight: '800' },
  preview: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  previewUnread: { color: colors.textSecondary, fontWeight: '600' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    alignSelf: 'center',
  },
  badgeTxt: { fontSize: 10, fontWeight: '900', color: '#0a0a0a' },
  purgeTxt: {
    alignSelf: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  swipeAction: {
    width: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  swipeActionDelete: { backgroundColor: colors.live },
  swipeActionRestore: { backgroundColor: colors.gold },
  swipeActionTxt: { fontSize: 11, fontWeight: '800', color: '#0a0a0a' },
});
