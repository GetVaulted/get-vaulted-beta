import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMessageThreads, patchThreadAction } from '../../api/messagesRepository';
import { useAuth } from '../../auth/AuthContext';
import { resolveRealtimeUserId, useCanonicalUserId } from '../../hooks/useCanonicalUserId';
import { syncServerNotifications } from '../../platform/notificationStore';
import { MessageThreadCard } from '../../components/messages/MessageThreadCard';
import { SwipeableThreadRow } from '../../components/messages/SwipeableThreadRow';
import { formatDeletedTimeLeft } from '../../lib/messageDisplay';
import type { RootStackParamList } from '../../navigation/types';
import { openMessageThread, openNewMessage } from '../../navigation/openMessages';
import type { ThreadListItem } from '../../types/messages';
import { colors, spacing } from '../../theme';
import { vaultFonts } from '../../theme/vaultTypography';
import { deriveMessagesInboxViewState, describeInboxLoadError } from './messagesInboxViewState';

type Props = NativeStackScreenProps<RootStackParamList, 'MessagesInbox'>;

export function MessagesInboxScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session, user } = useAuth();
  const token = session?.access_token;
  const canonicalUserId = useCanonicalUserId(token);
  const notificationUserId = resolveRealtimeUserId(canonicalUserId, user?.id);

  const [inbox, setInbox] = useState<'primary' | 'request' | 'deleted'>('primary');
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [undo, setUndo] = useState<{ id: string; username: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setThreads([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchMessageThreads(token, inbox);
      setThreads(data.threads);
      setRequestCount(data.requestCount);
      setLoadError(null);
    } catch (e) {
      setLoadError(describeInboxLoadError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [inbox, token]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Coming back from a conversation: refresh the list (so its unread count clears) and re-sync
  // notifications (so the bell / app-icon badge clears too).
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void load();
      if (token && notificationUserId) void syncServerNotifications(notificationUserId, token);
    }, [load, notificationUserId, token]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const removeLocally = (id: string) => setThreads((prev) => prev.filter((t) => t.id !== id));

  const runAction = (id: string, value: boolean, action: 'delete' | 'purge', failTitle: string) => {
    if (!token) return;
    removeLocally(id);
    void patchThreadAction(token, id, action, value).catch((e) => {
      Alert.alert(failTitle, e instanceof Error ? e.message : 'Try again.');
      void load();
    });
  };

  const onDeleteThread = (t: ThreadListItem) => {
    runAction(t.id, true, 'delete', 'Could not delete');
    if (inbox === 'request') setRequestCount((c) => Math.max(0, c - 1));
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ id: t.id, username: t.otherUsername });
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  };

  const onUndoDelete = () => {
    if (!token || !undo) return;
    const id = undo.id;
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    void patchThreadAction(token, id, 'delete', false)
      .catch((e) => Alert.alert('Could not undo', e instanceof Error ? e.message : 'Try again.'))
      .finally(() => void load());
  };

  const onRestoreThread = (t: ThreadListItem) => runAction(t.id, false, 'delete', 'Could not restore');

  const onPurgeThread = (t: ThreadListItem) => {
    Alert.alert(
      `Delete @${t.otherUsername} forever?`,
      "This removes the conversation from your account now. It can't be undone. They keep their own copy.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: () => runAction(t.id, true, 'purge', 'Could not delete') },
      ],
    );
  };

  const visibleThreads = useMemo(() => {
    const q = search.trim().replace(/^@/, '').toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.otherUsername.toLowerCase().includes(q));
  }, [threads, search]);
  const searching = search.trim().length > 0;

  const viewState = deriveMessagesInboxViewState({ loading, hasError: !!loadError, threadCount: visibleThreads.length });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => openNewMessage(navigation)}
          hitSlop={8}
          style={styles.composeBtn}
          accessibilityRole="button"
          accessibilityLabel="New message"
        >
          <Ionicons name="create-outline" size={20} color={colors.gold} />
        </Pressable>
      </View>
      <Text style={styles.title}>Messages</Text>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color="#9B9B9B" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search people"
          placeholderTextColor="#6E6E6E"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search people"
        />
      </View>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, inbox === 'primary' && styles.tabOn]} onPress={() => setInbox('primary')}>
          <Text style={[styles.tabTxt, inbox === 'primary' && styles.tabTxtOn]}>Inbox</Text>
        </Pressable>
        <Pressable style={[styles.tab, inbox === 'request' && styles.tabOn]} onPress={() => setInbox('request')}>
          <Text style={[styles.tabTxt, inbox === 'request' && styles.tabTxtOn]}>Requests</Text>
          {requestCount > 0 ? (
            <View style={styles.reqBadge}>
              <Text style={styles.reqBadgeTxt}>{requestCount > 9 ? '9+' : requestCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable style={[styles.tab, inbox === 'deleted' && styles.tabOn]} onPress={() => setInbox('deleted')}>
          <Text style={[styles.tabTxt, inbox === 'deleted' && styles.tabTxtOn]}>Deleted</Text>
        </Pressable>
      </View>

      {viewState === 'loading' ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={visibleThreads}
          keyExtractor={(t) => t.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
          contentContainerStyle={visibleThreads.length === 0 ? styles.emptyList : styles.list}
          ListHeaderComponent={
            inbox === 'deleted' && visibleThreads.length > 0 ? (
              <Text style={styles.deletedNote}>
                Deleted conversations are removed for good after 14 days. Only your copy is deleted, and the other
                person keeps theirs. Swipe right to restore, or left to delete forever.
              </Text>
            ) : null
          }
          ListEmptyComponent={
            viewState === 'error' ? (
              <View style={styles.empty}>
                <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Couldn't load your messages</Text>
                <Text style={styles.emptySub}>{loadError ?? 'Check your connection and try again.'}</Text>
                <Pressable style={styles.retryBtn} onPress={() => void load()}>
                  <Text style={styles.retryTxt}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>
                  {searching
                    ? 'No matches'
                    : inbox === 'request'
                      ? 'No message requests'
                      : inbox === 'deleted'
                        ? 'Nothing deleted'
                        : 'No conversations yet'}
                </Text>
                <Text style={styles.emptySub}>
                  {searching
                    ? 'No one in this folder matches that name.'
                    : inbox === 'request'
                      ? 'People you have not talked to yet will appear here until you accept.'
                      : inbox === 'deleted'
                        ? 'Conversations you delete stay here for 14 days, then are removed for good.'
                        : 'Start a conversation with anyone on Get Vaulted.'}
                </Text>
                {inbox === 'primary' && !searching ? (
                  <Pressable style={styles.retryBtn} onPress={() => openNewMessage(navigation)}>
                    <Text style={styles.retryTxt}>New message</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          }
          renderItem={({ item, index }) => (
            <SwipeableThreadRow
              mode={inbox === 'deleted' ? 'deleted' : 'inbox'}
              onDelete={() => onDeleteThread(item)}
              onRestore={() => onRestoreThread(item)}
              onPurge={() => onPurgeThread(item)}
            >
              <MessageThreadCard
                thread={item}
                showDivider={index > 0}
                timeText={inbox === 'deleted' ? formatDeletedTimeLeft(item.purgeAt) : undefined}
                onPress={() => {
                  // Opening a conversation reads it: clear its unread count right away.
                  setThreads((prev) => prev.map((t) => (t.id === item.id ? { ...t, unreadCount: 0 } : t)));
                  openMessageThread(navigation, item.id);
                }}
              />
            </SwipeableThreadRow>
          )}
        />
      )}

      {undo ? (
        <View style={[styles.undoBar, { bottom: insets.bottom + 16 }]}>
          <Text style={styles.undoTxt} numberOfLines={1}>
            Moved @{undo.username} to Deleted
          </Text>
          <Pressable onPress={onUndoDelete} hitSlop={10} accessibilityRole="button" accessibilityLabel="Undo delete">
            <Text style={styles.undoBtn}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    height: 44,
  },
  back: { padding: 4, marginLeft: -6 },
  composeBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  title: {
    fontFamily: vaultFonts.display,
    fontSize: 30,
    lineHeight: 32,
    letterSpacing: -0.3,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    marginHorizontal: spacing.md,
    marginBottom: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.12)',
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 0 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.14)',
  },
  tabOn: { backgroundColor: 'rgba(212,175,55,0.15)', borderColor: 'rgba(212,175,55,0.45)' },
  tabTxt: {
    fontFamily: vaultFonts.label,
    fontSize: 15,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: '#9B9B9B',
  },
  tabTxtOn: { color: colors.gold },
  reqBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  reqBadgeTxt: { fontSize: 11, fontWeight: '700', color: colors.background },
  list: { paddingBottom: spacing.xxl },
  deletedNote: {
    fontSize: 13,
    lineHeight: 18,
    color: '#9B9B9B',
    paddingHorizontal: spacing.md,
    paddingTop: 4,
    paddingBottom: 12,
  },
  undoBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  undoTxt: { flex: 1, fontSize: 14, color: colors.textPrimary },
  undoBtn: { fontFamily: vaultFonts.label, fontSize: 16, letterSpacing: 1, textTransform: 'uppercase', color: colors.gold },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontFamily: vaultFonts.display, fontSize: 20, color: colors.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: 14, color: '#9B9B9B', textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    marginTop: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(212,175,55,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryTxt: { fontFamily: vaultFonts.label, fontSize: 16, letterSpacing: 1, textTransform: 'uppercase', color: colors.gold },
});
