import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { fetchAdminSupportTickets, type AdminSupportTicket } from '../../api/adminOpsApi';
import {
  AdminEmpty,
  AdminFilterChips,
  AdminListRow,
  AdminScreenShell,
  AdminSearchField,
} from '../../components/admin/adminUi';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminSupportTickets'>;
type StatusFilter = '' | 'submitted' | 'in_progress' | 'resolved' | 'closed';

export function AdminSupportTicketsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [status, setStatus] = useState<StatusFilter>('submitted');
  const [q, setQ] = useState('');
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [openCount, setOpenCount] = useState(0);
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
        const data = await fetchAdminSupportTickets(token, {
          status: status || undefined,
          q: q.trim() || undefined,
        });
        setTickets(data.tickets);
        setOpenCount(data.openCount);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load tickets');
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
      title="Support tickets"
      subtitle={`${openCount} open`}
      onBack={() => navigation.goBack()}
      loading={loading && tickets.length === 0}
      error={error && tickets.length === 0 ? error : null}
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
        placeholder="Search subject, user, email…"
        onSubmit={() => void load()}
      />
      <AdminFilterChips
        options={[
          { id: 'submitted', label: 'Submitted' },
          { id: 'in_progress', label: 'In progress' },
          { id: 'resolved', label: 'Resolved' },
          { id: 'closed', label: 'Closed' },
          { id: '', label: 'All' },
        ]}
        value={status}
        onChange={setStatus}
      />
      {tickets.length === 0 ? (
        <AdminEmpty message="No tickets in this filter." />
      ) : (
        tickets.map((t) => (
          <AdminListRow
            key={t.id}
            title={t.subject}
            meta={`@${t.username} · ${t.categoryLabel} · ${new Date(t.createdAt).toLocaleString()}`}
            badge={t.statusLabel || t.status}
            badgeWarn={t.status === 'submitted' || t.status === 'in_progress'}
            onPress={() => navigation.navigate('AdminSupportTicketDetail', { ticketId: t.id })}
          />
        ))
      )}
    </AdminScreenShell>
  );
}
