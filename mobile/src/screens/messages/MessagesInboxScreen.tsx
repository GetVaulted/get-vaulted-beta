import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMessageThreads } from '../../api/messagesRepository';
import { useAuth } from '../../auth/AuthContext';
import { MessageThreadCard } from '../../components/messages/MessageThreadCard';
import type { RootStackParamList } from '../../navigation/types';
import { openMessageThread, openNewMessage } from '../../navigation/openMessages';
import type { ThreadListItem } from '../../types/messages';
import { colors, spacing } from '../../theme';
import { vaultFonts } from '../../theme/vaultTypography';
import { deriveMessagesInboxViewState, describeInboxLoadError } from './messagesInboxViewState';

type Props = NativeStackScreenProps<RootStackParamList, 'MessagesInbox'>;

export function MessagesInboxScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;

  const [inbox, setInbox] = useState<'primary' | 'request'>('primary');
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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
      </View>

      {viewState === 'loading' ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={visibleThreads}
          keyExtractor={(t) => t.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
          contentContainerStyle={visibleThreads.length === 0 ? styles.emptyList : styles.list}
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
                  {searching ? 'No matches' : inbox === 'request' ? 'No message requests' : 'No conversations yet'}
                </Text>
                <Text style={styles.emptySub}>
                  {searching
                    ? 'No one in this folder matches that name.'
                    : inbox === 'request'
                      ? 'People you have not talked to yet will appear here until you accept.'
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
            <MessageThreadCard
              thread={item}
              showDivider={index > 0}
              onPress={() => openMessageThread(navigation, item.id)}
            />
          )}
        />
      )}
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
