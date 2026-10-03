import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { fetchAdminUsers, patchAdminUser, type AdminUserRow } from '../../api/adminOpsApi';
import {
  AdminActionButton,
  AdminEmpty,
  AdminListRow,
  AdminScreenShell,
  AdminSearchField,
} from '../../components/admin/adminUi';
import type { RootStackParamList } from '../../navigation/types';
import { spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminUsers'>;

export function AdminUsersScreen({ navigation }: Props) {
  const { session, user } = useAuth();
  const token = session?.access_token;
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (quiet?: boolean) => {
      if (!token) {
        setError('Sign in required.');
        setLoading(false);
        return;
      }
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const data = await fetchAdminUsers(token, q.trim() || undefined);
        setUsers(data.users);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, q],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggleSuspend = (row: AdminUserRow) => {
    if (!token) return;
    if (row.id === user?.id) {
      Alert.alert('Not allowed', 'You cannot change your own account here.');
      return;
    }
    const suspending = !row.suspendedAt;
    Alert.alert(
      suspending ? 'Suspend user' : 'Restore user',
      `@${row.username}\n${row.email}`,
      [
        { text: 'Back', style: 'cancel' },
        {
          text: suspending ? 'Suspend' : 'Restore',
          style: suspending ? 'destructive' : 'default',
          onPress: () => {
            void (async () => {
              setBusyId(row.id);
              try {
                const res = await patchAdminUser(token, row.id, suspending ? 'suspend' : 'unsuspend');
                if (suspending && (res.liveShowsEnded || res.liveShowsCancelled)) {
                  Alert.alert(
                    'Suspended',
                    `Ended ${res.liveShowsEnded ?? 0} live · cancelled ${res.liveShowsCancelled ?? 0} scheduled`,
                  );
                }
                await load(true);
              } catch (e) {
                Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <AdminScreenShell
      title="Users"
      subtitle="Search, suspend, restore"
      onBack={() => navigation.goBack()}
      loading={loading && users.length === 0}
      error={error && users.length === 0 ? error : null}
      onRetry={() => void load()}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load(true);
      }}
    >
      <AdminSearchField
        value={q}
        onChange={setQ}
        placeholder="Search email or username…"
        onSubmit={() => void load()}
      />
      {users.length === 0 ? (
        <AdminEmpty message={q.trim() ? 'No users match.' : 'Search to find users.'} />
      ) : (
        users.map((u) => (
          <View key={u.id} style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <AdminListRow
              title={`@${u.username}`}
              meta={`${u.email} · ${u.role}`}
              badge={u.suspendedAt ? 'suspended' : u.role}
              badgeWarn={Boolean(u.suspendedAt)}
              onPress={() => navigation.navigate('UserProfile', { userId: u.id })}
            />
            <AdminActionButton
              label={
                busyId === u.id ? '…' : u.suspendedAt ? 'Restore' : 'Suspend'
              }
              tone={u.suspendedAt ? 'success' : 'danger'}
              disabled={busyId === u.id}
              onPress={() => toggleSuspend(u)}
            />
          </View>
        ))
      )}
    </AdminScreenShell>
  );
}
