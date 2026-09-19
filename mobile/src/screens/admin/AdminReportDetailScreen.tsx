import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { fetchAdminReport, patchAdminReport, type AdminReport } from '../../api/adminOpsApi';
import {
  AdminActionButton,
  AdminNotesField,
  AdminScreenShell,
} from '../../components/admin/adminUi';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminReportDetail'>;

export function AdminReportDetailScreen({ navigation, route }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [report, setReport] = useState<AdminReport | null>(null);
  const [reporterEmail, setReporterEmail] = useState('');
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
      const data = await fetchAdminReport(token, route.params.reportId);
      setReport(data.report);
      setReporterEmail(data.reporterEmail);
      setNotes(data.report.moderationNotes ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, route.params.reportId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const act = (action: 'assign' | 'reviewing' | 'resolve' | 'dismiss' | 'note') => {
    if (!token || !report) return;
    void (async () => {
      setBusy(true);
      try {
        const res = await patchAdminReport(token, report.id, {
          action,
          moderationNotes: notes,
        });
        setReport(res.report);
        setNotes(res.report.moderationNotes ?? '');
        Alert.alert('Updated', action);
      } catch (e) {
        Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <AdminScreenShell
      title="Report"
      subtitle={report ? report.targetType : undefined}
      onBack={() => navigation.goBack()}
      loading={loading}
      error={error}
      onRetry={() => void load()}
    >
      {report ? (
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: colors.gold, fontWeight: '800', fontSize: 12, textTransform: 'uppercase' }}>
            {report.status} · {report.reason}
          </Text>
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>
            Target {report.targetType}: {report.targetId}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            Reporter @{report.reporter?.username ?? '—'} ({reporterEmail})
          </Text>
          {report.description ? (
            <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}>
              {report.description}
            </Text>
          ) : null}
          <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Moderation notes</Text>
          <AdminNotesField value={notes} onChange={setNotes} />
          <AdminActionButton label={busy ? '…' : 'Save note'} disabled={busy} onPress={() => act('note')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 110 }}>
              <AdminActionButton label="Assign me" disabled={busy} onPress={() => act('assign')} />
            </View>
            <View style={{ flex: 1, minWidth: 110 }}>
              <AdminActionButton label="Reviewing" disabled={busy} onPress={() => act('reviewing')} />
            </View>
            <View style={{ flex: 1, minWidth: 110 }}>
              <AdminActionButton
                label="Resolve"
                tone="success"
                disabled={busy}
                onPress={() => act('resolve')}
              />
            </View>
            <View style={{ flex: 1, minWidth: 110 }}>
              <AdminActionButton
                label="Dismiss"
                tone="danger"
                disabled={busy}
                onPress={() => act('dismiss')}
              />
            </View>
          </View>
        </View>
      ) : null}
    </AdminScreenShell>
  );
}
