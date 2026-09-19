import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { fetchAdminReports, type AdminReport } from '../../api/adminOpsApi';
import {
  AdminEmpty,
  AdminFilterChips,
  AdminListRow,
  AdminScreenShell,
  AdminSearchField,
} from '../../components/admin/adminUi';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminTrust'>;
type StatusFilter = '' | 'open' | 'reviewing' | 'resolved' | 'dismissed';

export function AdminTrustScreen({ navigation }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [status, setStatus] = useState<StatusFilter>('open');
  const [q, setQ] = useState('');
  const [reports, setReports] = useState<AdminReport[]>([]);
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
        const data = await fetchAdminReports(token, {
          status: status || undefined,
          q: q.trim() || undefined,
        });
        setReports(data.reports);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load reports');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, status, q],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <AdminScreenShell
      title="Trust & reports"
      subtitle="User, listing, live, and chat reports"
      onBack={() => navigation.goBack()}
      loading={loading && reports.length === 0}
      error={error && reports.length === 0 ? error : null}
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
        placeholder="Search target, description, reporter…"
        onSubmit={() => void load()}
      />
      <AdminFilterChips
        options={[
          { id: 'open', label: 'Open' },
          { id: 'reviewing', label: 'Reviewing' },
          { id: 'resolved', label: 'Resolved' },
          { id: 'dismissed', label: 'Dismissed' },
          { id: '', label: 'All' },
        ]}
        value={status}
        onChange={setStatus}
      />
      {reports.length === 0 ? (
        <AdminEmpty message="No reports in this filter." />
      ) : (
        reports.map((r) => (
          <AdminListRow
            key={r.id}
            title={`${r.targetType} · ${r.reason}`}
            meta={`@${r.reporter?.username ?? 'unknown'} → ${r.targetId.slice(0, 12)}… · ${new Date(r.createdAt).toLocaleString()}`}
            badge={r.status}
            badgeWarn={r.status === 'open' || r.status === 'reviewing'}
            onPress={() => navigation.navigate('AdminReportDetail', { reportId: r.id })}
          />
        ))
      )}
    </AdminScreenShell>
  );
}
