import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMessageThreads, patchThreadAction } from '../../api/messagesRepository';
import { useAuth } from '../../auth/AuthContext';
import { MessageThreadCard } from '../../components/messages/MessageThreadCard';
import type { RootStackParamList } from '../../navigation/types';
import { openMessageThread, openNewMessage } from '../../navigation/openMessages';
import type { MessageThreadView, ThreadListItem } from '../../types/messages';
import { colors, radii, spacing } from '../../theme';
import { deriveMessagesInboxViewState, describeInboxLoadError } from './messagesInboxViewState';

type Props = NativeStackScreenProps<RootStackParamList, 'MessagesInbox'>;

export function MessagesInboxScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;

  const [inbox, setInbox] = useState<MessageThreadView>('primary');
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  // Optimistic: the row disappears from this list immediately on swipe, and the server call rides
  // along in the background. On failure, reload so the list matches server state again rather than
  // leaving a row missing that never actually got deleted/restored.
  const onDeleteThread = (threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (!token) return;
    void patchThreadAction(token, threadId, 'delete').catch(() => void load());
  };

  const onRestoreThread = (threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (!token) return;
    void patchThreadAction(token, threadId, 'restore').catch(() => void load());
  };

  const viewState = deriveMessagesInboxViewState({ loading, hasError: !!loadError, threadCount: threads.length });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={['rgba(212,175,55,0.08)', 'transparent']}
        style={styles.topGlow}
        pointerEvents="none"
      />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Messages</Text>
          <Text style={styles.sub}>Private commerce · collector network</Text>
        </View>
        <Pressable
          onPress={() => openNewMessage(navigation)}
          hitSlop={12}
          style={styles.composeBtn}
          accessibilityRole="button"
          accessibilityLabel="New message"
        >
          <Ionicons name="create-outline" size={22} color={colors.gold} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, inbox === 'primary' && styles.tabOn]}
          onPress={() => setInbox('primary')}
        >
          <Text style={[styles.tabTxt, inbox === 'primary' && styles.tabTxtOn]}>Inbox</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, inbox === 'request' && styles.tabOn]}
          onPress={() => setInbox('request')}
        >
          <Text style={[styles.tabTxt, inbox === 'request' && styles.tabTxtOn]}>Requests</Text>
          {requestCount > 0 ? (
            <View style={styles.reqBadge}>
              <Text style={styles.reqBadgeTxt}>{requestCount > 9 ? '9+' : requestCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          style={[styles.tab, inbox === 'trash' && styles.tabOn]}
          onPress={() => setInbox('trash')}
        >
          <Text style={[styles.tabTxt, inbox === 'trash' && styles.tabTxtOn]}>Trash</Text>
        </Pressable>
      </View>

      {viewState === 'loading' ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
          contentContainerStyle={threads.length === 0 ? styles.emptyList : styles.list}
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
                <Ionicons
                  name={inbox === 'trash' ? 'trash-outline' : 'chatbubbles-outline'}
                  size={40}
                  color={colors.textMuted}
                />
                <Text style={styles.emptyTitle}>
                  {inbox === 'trash'
                    ? 'Trash is empty'
                    : inbox === 'request'
                      ? 'No message requests'
                      : 'No conversations yet'}
                </Text>
                <Text style={styles.emptySub}>
                  {inbox === 'trash'
                    ? 'Deleted conversations stay here for 14 days before they’re gone for good.'
                    : inbox === 'request'
                      ? 'New collectors will appear here until you accept.'
                      : 'Search for a collector, or message a seller from a listing or live show.'}
                </Text>
                {inbox === 'primary' ? (
                  <Pressable style={styles.retryBtn} onPress={() => openNewMessage(navigation)}>
                    <Text style={styles.retryTxt}>New message</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <MessageThreadCard
              thread={item}
              onPress={() => openMessageThread(navigation, item.id)}
              onDelete={inbox === 'trash' ? undefined : () => onDeleteThread(item.id)}
              onRestore={inbox === 'trash' ? () => onRestoreThread(item.id) : undefined}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topGlow: { position: 'absolute', left: 0, right: 0, top: 0, height: 160 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  back: { padding: 4 },
  headerText: { flex: 1 },
  composeBtn: {
    padding: 8,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  title: { fontSize: 24, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.3 },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.pill,
  },
  tabOn: { backgroundColor: 'rgba(212,175,55,0.15)' },
  tabTxt: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  tabTxtOn: { color: colors.gold },
  reqBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.live,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  reqBadgeTxt: { fontSize: 9, fontWeight: '900', color: '#fff' },
  list: { paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginLeft: spacing.md + 46 + spacing.sm,
  },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  retryBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  retryTxt: { color: colors.gold, fontWeight: '800', fontSize: 14 },
});
