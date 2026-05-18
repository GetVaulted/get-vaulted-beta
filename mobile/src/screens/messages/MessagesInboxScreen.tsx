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
import { fetchMessageThreads } from '../../api/messagesRepository';
import { useAuth } from '../../auth/AuthContext';
import { MessageThreadCard } from '../../components/messages/MessageThreadCard';
import type { RootStackParamList } from '../../navigation/types';
import { openMessageThread } from '../../navigation/openMessages';
import type { ThreadListItem } from '../../types/messages';
import { colors, radii, spacing } from '../../theme';

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

  const load = useCallback(async () => {
    if (!token) {
      setThreads([]);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchMessageThreads(token, inbox);
      setThreads(data.threads);
      setRequestCount(data.requestCount);
    } catch {
      setThreads([]);
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
      </View>

      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
          contentContainerStyle={threads.length === 0 ? styles.emptyList : styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {inbox === 'request' ? 'No message requests' : 'No conversations yet'}
              </Text>
              <Text style={styles.emptySub}>
                {inbox === 'request'
                  ? 'New collectors will appear here until you accept.'
                  : 'Message a seller from a listing or live show to start negotiating.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <MessageThreadCard
              thread={item}
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
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
