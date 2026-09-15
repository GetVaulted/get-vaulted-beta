import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import {
  fetchBlockedUsers,
  setUserBlockedRemote,
  type BlockedUserRow,
} from '../../api/userBlockRepository';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { UserAvatar } from '../../components/ui/UserAvatar';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'BlockedUsers'>;

export function BlockedUsersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [rows, setRows] = useState<BlockedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchBlockedUsers(token));
    } catch (e) {
      Alert.alert('Blocked users', e instanceof Error ? e.message : 'Could not load list.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unblock = (row: BlockedUserRow) => {
    const token = session?.access_token;
    if (!token) return;
    Alert.alert('Unblock user', `Unblock @${row.username ?? 'user'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: () => {
          setBusyId(row.userId);
          void setUserBlockedRemote(token, row.userId, false)
            .then(() => setRows((prev) => prev.filter((r) => r.userId !== row.userId)))
            .catch((e) =>
              Alert.alert('Unblock failed', e instanceof Error ? e.message : 'Try again.'),
            )
            .finally(() => setBusyId(null));
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader
        title="Blocked users"
        subtitle="They can’t find you or see your content"
        onBack={() => navigation.goBack()}
      />
      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>You haven’t blocked anyone.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <UserAvatar
                uri={item.image}
                name={item.username ?? 'User'}
                username={item.username}
                size={40}
                tone="light"
                borderColor={colors.borderStrong}
              />
              <Text style={styles.handle} numberOfLines={1}>
                @{item.username ?? 'user'}
              </Text>
              <Pressable
                style={styles.unblock}
                disabled={busyId === item.userId}
                onPress={() => unblock(item)}
              >
                <Text style={styles.unblockText}>
                  {busyId === item.userId ? '…' : 'Unblock'}
                </Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  empty: { color: colors.textSecondary, marginTop: spacing.xl, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  handle: { flex: 1, color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  unblock: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  unblockText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
});
