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
import { colors, spacing } from '../../theme';
import { vaultFonts } from '../../theme/vaultTypography';

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
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
      </View>
      <Text style={styles.title}>New message</Text>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.gold} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search people"
          placeholderTextColor="#6E6E6E"
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
                <Ionicons name="person-outline" size={36} color="#6E6E6E" />
                <Text style={styles.emptyTitle}>Find someone to message</Text>
                <Text style={styles.emptySub}>Search a username to start a private conversation.</Text>
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
              size={48}
              cornerRadius={15}
              tone="light"
              borderColor="rgba(212,175,55,0.45)"
              borderWidth={1.5}
            />
            <View style={styles.rowText}>
              <Text style={styles.username}>@{item.username.replace(/^@/, '')}</Text>
              <Text style={styles.rowHint}>Send a message</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#6E6E6E" />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, height: 44 },
  back: { padding: 4, marginLeft: -6 },
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
    height: 48,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#0F0F0F',
    borderWidth: 1.5,
    borderColor: 'rgba(212,175,55,0.55)',
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 0 },
  list: { paddingBottom: spacing.xxl },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  empty: { alignItems: 'center', gap: spacing.sm },
  emptyTitle: { fontFamily: vaultFonts.display, fontSize: 20, color: colors.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: 14, color: '#9B9B9B', textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,175,55,0.10)',
  },
  rowText: { flex: 1, gap: 2 },
  username: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowHint: { fontSize: 13, color: '#9B9B9B' },
});
