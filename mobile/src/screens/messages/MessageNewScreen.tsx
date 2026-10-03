import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchMentionUsers, type MentionSearchUser } from '../../api/mentionSearchRepository';
import { useAuth } from '../../auth/AuthContext';
import { UserAvatar } from '../../components/ui/UserAvatar';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MessageNew'>;

const DEBOUNCE_MS = 280;

export function MessageNewScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MentionSearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestGen = useRef(0);

  const runSearch = useCallback(
    async (raw: string) => {
      const q = raw.trim().replace(/^@/, '');
      if (!token || q.length < 1) {
        setResults([]);
        setSearching(false);
        setSearched(false);
        return;
      }
      const gen = ++requestGen.current;
      setSearching(true);
      try {
        const users = await searchMentionUsers(token, q);
        if (gen !== requestGen.current) return;
        setResults(users);
        setSearched(true);
      } catch {
        if (gen !== requestGen.current) return;
        setResults([]);
        setSearched(true);
      } finally {
        if (gen === requestGen.current) setSearching(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setSearching(false);
      setSearched(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      void runSearch(q);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const onPick = (u: MentionSearchUser) => {
    navigation.replace('MessageCompose', {
      sellerUserId: u.id,
      sellerUsername: u.username,
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.title}>New message</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by username"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searching ? <ActivityIndicator size="small" color={colors.gold} /> : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={(u) => u.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={results.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            {!token ? (
              <Text style={styles.emptySub}>Sign in to message collectors.</Text>
            ) : query.trim().length < 1 ? (
              <>
                <Ionicons name="person-outline" size={36} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Find someone to message</Text>
                <Text style={styles.emptySub}>Search a Vaulted username to start a conversation.</Text>
              </>
            ) : searching ? (
              <Text style={styles.emptySub}>Searching…</Text>
            ) : searched ? (
              <>
                <Text style={styles.emptyTitle}>No users found</Text>
                <Text style={styles.emptySub}>Try a different username spelling.</Text>
              </>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onPick(item)} accessibilityRole="button">
            <UserAvatar
              uri={item.image}
              username={item.username}
              size={44}
              borderColor="rgba(255,255,255,0.2)"
            />
            <View style={styles.rowText}>
              <Text style={styles.username}>@{item.username.replace(/^@/, '')}</Text>
              <Text style={styles.rowHint}>Message</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      />
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
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    paddingVertical: 10,
  },
  list: { paddingBottom: spacing.xxl },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  empty: { alignItems: 'center', gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, gap: 2 },
  username: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  rowHint: { fontSize: 12, color: colors.textMuted },
});
