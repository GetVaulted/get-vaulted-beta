import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { resolveRealtimeUserId, useCanonicalUserId } from '../../hooks/useCanonicalUserId';
import {
  groupNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerPushNotificationHooks,
  syncServerNotifications,
} from '../../platform/notificationStore';
import { openMessageThread } from '../../navigation/openMessages';
import { openNotificationHref } from '../../navigation/openNotificationHref';
import type { AppNotification } from '../../platform/notificationTypes';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationInbox'>;

export function NotificationInboxScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, session } = useAuth();
  const canonicalUserId = useCanonicalUserId(session?.access_token);
  const inboxUserId = resolveRealtimeUserId(canonicalUserId, user?.id);
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedOnceRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!inboxUserId) return;
    const silent = opts?.silent ?? loadedOnceRef.current;
    if (!silent) setLoading(true);
    try {
      if (session?.access_token) await syncServerNotifications(inboxUserId, session.access_token);
      setRows(await listNotifications(inboxUserId));
      if (user?.id) registerPushNotificationHooks(user.id, session?.access_token);
    } finally {
      loadedOnceRef.current = true;
      setLoading(false);
    }
  }, [inboxUserId, session?.access_token, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load({ silent: true });
    }, [load]),
  );

  const groups = useMemo(() => groupNotifications(rows), [rows]);

  const openRow = async (n: AppNotification) => {
    await markNotificationRead(n.id, session?.access_token);
    setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, read: true } : r)));

    if (n.href) {
      openNotificationHref(navigation, n.href, { type: n.serverType, notificationId: n.id });
      return;
    }

    if (n.kind === 'message' && n.referenceId) {
      openMessageThread(navigation, n.referenceId);
      return;
    }
    if (n.kind === 'support' && n.referenceId) {
      navigation.navigate('SupportTicketDetail', { ticketId: n.referenceId });
      return;
    }
    if (n.kind === 'dispute' && n.referenceId) {
      navigation.navigate('DisputeDetail', { disputeId: n.referenceId });
      return;
    }
    if (n.kind === 'trade' && n.referenceId) {
      navigation.navigate('MainTabs', {
        screen: 'TradeCenter',
        params: { screen: 'TradeDetail', params: { tradeId: n.referenceId } },
      });
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader
        title="Notifications"
        subtitle="Sales, messages, offers, and vault activity"
        onBack={() => navigation.goBack()}
      />
      {rows.some((r) => !r.read) ? (
        <Pressable
          onPress={() =>
            inboxUserId &&
            void markAllNotificationsRead(inboxUserId, session?.access_token).then(() => load({ silent: true }))
          }
        >
          <Text style={styles.markAll}>Mark all read</Text>
        </Pressable>
      ) : null}
      {loading && !loadedOnceRef.current ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : rows.length ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {groups.map((g) => (
            <View key={g.kind} style={styles.group}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle}>{g.label}</Text>
                {g.unread > 0 ? <Text style={styles.groupUnread}>{g.unread} new</Text> : null}
              </View>
              {g.items.map((n) => (
                <Pressable
                  key={n.id}
                  style={[styles.row, !n.read && styles.rowUnread]}
                  onPress={() => void openRow(n)}
                >
                  <Text style={styles.title}>{n.title}</Text>
                  <Text style={styles.body}>{n.body}</Text>
                  <Text style={styles.meta}>{new Date(n.createdAt).toLocaleString()}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.empty}>
          No notifications yet. When something sells, you get a message, or an offer comes in, it shows up here.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  markAll: { color: colors.gold, fontWeight: '700', marginBottom: spacing.sm },
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxxl },
  group: { gap: spacing.sm },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupTitle: { fontSize: 12, fontWeight: '800', color: colors.gold, textTransform: 'uppercase' },
  groupUnread: { fontSize: 11, color: colors.live, fontWeight: '700' },
  row: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: 4,
  },
  rowUnread: { borderColor: colors.gold },
  title: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  body: { fontSize: 13, color: colors.textSecondary },
  meta: { fontSize: 11, color: colors.textMuted },
  empty: { color: colors.textMuted, marginTop: spacing.xl, lineHeight: 20 },
});
