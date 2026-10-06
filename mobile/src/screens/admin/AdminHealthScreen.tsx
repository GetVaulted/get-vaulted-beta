import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { fetchAdminHealth, type AdminHealthCheck } from '../../api/adminOpsApi';
import { AdminEmpty, AdminListRow, AdminScreenShell } from '../../components/admin/adminUi';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminHealth'>;

export function AdminHealthScreen({ navigation }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [overall, setOverall] = useState('—');
  const [checks, setChecks] = useState<AdminHealthCheck[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const data = await fetchAdminHealth(token);
        setOverall(data.overall);
        setChecks(data.checks);
        setUpdatedAt(data.updatedAt);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      const id = setInterval(() => void load(true), 60_000);
      return () => clearInterval(id);
    }, [load]),
  );

  return (
    <AdminScreenShell
      title="Platform health"
      subtitle={`Overall: ${overall}${updatedAt ? ` · ${new Date(updatedAt).toLocaleString()}` : ''}`}
      onBack={() => navigation.goBack()}
      loading={loading && checks.length === 0}
      error={error && checks.length === 0 ? error : null}
      onRetry={() => void load()}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load(true);
      }}
    >
      {checks.length === 0 ? (
        <AdminEmpty message="No health checks returned." />
      ) : (
        checks.map((c) => (
          <View key={c.id} style={{ gap: 4, marginBottom: spacing.sm }}>
            <AdminListRow
              title={c.label}
              meta={c.detail || c.issue || undefined}
              badge={c.status}
              badgeWarn={c.status === 'error' || c.status === 'degraded'}
            />
            {c.solution ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, paddingHorizontal: 4 }}>
                Fix: {c.solution}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </AdminScreenShell>
  );
}
