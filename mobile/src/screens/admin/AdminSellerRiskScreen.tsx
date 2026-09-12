import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import {
  fetchAdminSellerRisk,
  patchAdminUser,
  type AdminSellerRisk,
} from '../../api/adminOpsApi';
import {
  AdminActionButton,
  AdminEmpty,
  AdminFilterChips,
  AdminListRow,
  AdminScreenShell,
} from '../../components/admin/adminUi';
import type { RootStackParamList } from '../../navigation/types';
import { spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminSellerRisk'>;

export function AdminSellerRiskScreen({ navigation }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [pendingOnly, setPendingOnly] = useState(true);
  const [sellers, setSellers] = useState<AdminSellerRisk[]>([]);
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
        const data = await fetchAdminSellerRisk(token, pendingOnly);
        setSellers(data.sellers);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, pendingOnly],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const suspend = (row: AdminSellerRisk) => {
    if (!token) return;
    Alert.alert('Suspend seller', `@${row.username}`, [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Suspend',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(row.id);
            try {
              await patchAdminUser(token, row.id, 'suspend', 'seller risk review');
              await load(true);
            } catch (e) {
              Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  return (
    <AdminScreenShell
      title="Seller risk"
      subtitle="Payout reviews and standing"
      onBack={() => navigation.goBack()}
      loading={loading && sellers.length === 0}
      error={error && sellers.length === 0 ? error : null}
      onRetry={() => void load()}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load(true);
      }}
    >
      <AdminFilterChips
        options={[
          { id: 'pending', label: 'Pending review' },
          { id: 'all', label: 'All sellers' },
        ]}
        value={pendingOnly ? 'pending' : 'all'}
        onChange={(v) => setPendingOnly(v === 'pending')}
      />
      {sellers.length === 0 ? (
        <AdminEmpty message="No sellers in this filter." />
      ) : (
        sellers.map((s) => {
          const m = s.metrics;
          return (
            <View key={s.id} style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
              <AdminListRow
                title={`@${s.username}`}
                meta={[
                  s.email,
                  m
                    ? `GMV $${m.lifetimeGmvUsd.toFixed(0)} · disputes ${(m.disputeRate * 100).toFixed(1)}% · ${m.accountStanding}`
                    : null,
                  s.fastPayoutStatus ? `fast:${s.fastPayoutStatus}` : null,
                  s.instantPayoutApprovalStatus ? `instant:${s.instantPayoutApprovalStatus}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={s.suspendedAt ? 'suspended' : s.sellerLevel ?? 'seller'}
                badgeWarn={Boolean(s.suspendedAt)}
                onPress={() => navigation.navigate('UserProfile', { userId: s.id })}
              />
              {!s.suspendedAt ? (
                <AdminActionButton
                  label={busyId === s.id ? '…' : 'Suspend'}
                  tone="danger"
                  disabled={busyId === s.id}
                  onPress={() => suspend(s)}
                />
              ) : null}
            </View>
          );
        })
      )}
    </AdminScreenShell>
  );
}
