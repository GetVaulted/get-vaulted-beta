import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import {
  fetchAdminSupportTicket,
  patchAdminSupportTicket,
  type AdminSupportTicket,
} from '../../api/adminOpsApi';
import {
  AdminActionButton,
  AdminNotesField,
  AdminScreenShell,
} from '../../components/admin/adminUi';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminSupportTicketDetail'>;

export function AdminSupportTicketDetailScreen({ navigation, route }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [ticket, setTicket] = useState<AdminSupportTicket | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setError('Sign in required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminSupportTicket(token, route.params.ticketId);
      setTicket(data.ticket);
      setNotes(data.ticket.adminNotes ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, route.params.ticketId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const save = async (status?: string) => {
    if (!token || !ticket) return;
    setBusy(true);
    try {
      const res = await patchAdminSupportTicket(token, ticket.id, {
        status,
        adminNotes: notes,
      });
      setTicket(res.ticket);
      setNotes(res.ticket.adminNotes ?? '');
      Alert.alert('Saved', status ? `Marked ${status.replace('_', ' ')}` : 'Notes updated');
    } catch (e) {
      Alert.alert('Update failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminScreenShell
      title="Ticket"
      subtitle={ticket ? `@${ticket.username}` : undefined}
      onBack={() => navigation.goBack()}
      loading={loading}
      error={error}
      onRetry={() => void load()}
    >
      {ticket ? (
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: colors.gold, fontWeight: '800', fontSize: 12, textTransform: 'uppercase' }}>
            {ticket.statusLabel || ticket.status} · {ticket.categoryLabel}
          </Text>
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800' }}>{ticket.subject}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {ticket.contactEmail ?? 'No contact email'} · {new Date(ticket.createdAt).toLocaleString()}
          </Text>
          {ticket.referenceId ? (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Ref: {ticket.referenceType} / {ticket.referenceId}
            </Text>
          ) : null}
          <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}>{ticket.message}</Text>
          <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Admin notes</Text>
          <AdminNotesField value={notes} onChange={setNotes} placeholder="Internal notes / reply context" />
          <AdminActionButton label={busy ? 'Saving…' : 'Save notes'} disabled={busy} onPress={() => void save()} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 120 }}>
              <AdminActionButton
                label="In progress"
                disabled={busy}
                onPress={() => void save('in_progress')}
              />
            </View>
            <View style={{ flex: 1, minWidth: 120 }}>
              <AdminActionButton
                label="Resolve"
                tone="success"
                disabled={busy}
                onPress={() => void save('resolved')}
              />
            </View>
            <View style={{ flex: 1, minWidth: 120 }}>
              <AdminActionButton
                label="Close"
                tone="danger"
                disabled={busy}
                onPress={() => void save('closed')}
              />
            </View>
          </View>
        </View>
      ) : null}
    </AdminScreenShell>
  );
}
