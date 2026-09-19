import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import {
  fetchAdminOrders,
  fetchAdminRefundRequests,
  patchAdminRefundRequest,
  postAdminRefundRetry,
  type AdminOrderRow,
  type AdminRefundRequest,
} from '../../api/adminOpsApi';
import {
  AdminActionButton,
  AdminEmpty,
  AdminFilterChips,
  AdminListRow,
  AdminScreenShell,
} from '../../components/admin/adminUi';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminFulfillment'>;
type Tab = 'orders' | 'refunds';
type OrderStatus = 'all' | 'pending' | 'paid' | 'shipped' | 'delivered';

function formatUsd(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

export function AdminFulfillmentScreen({ navigation }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [tab, setTab] = useState<Tab>('refunds');
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('paid');
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [refunds, setRefunds] = useState<AdminRefundRequest[]>([]);
  const [stuck, setStuck] = useState<AdminRefundRequest[]>([]);
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
        if (tab === 'orders') {
          const data = await fetchAdminOrders(token, orderStatus);
          setOrders(data.orders);
        } else {
          const data = await fetchAdminRefundRequests(token);
          setRefunds(data.requests);
          setStuck(data.stuckRequests);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, tab, orderStatus],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const resolveRefund = (row: AdminRefundRequest, approve: boolean) => {
    if (!token) return;
    Alert.alert(approve ? 'Approve refund' : 'Deny refund', row.listingTitle ?? row.orderId, [
      { text: 'Back', style: 'cancel' },
      {
        text: approve ? 'Approve' : 'Deny',
        style: approve ? 'default' : 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(row.id);
            try {
              await patchAdminRefundRequest(token, row.id, approve);
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

  const retryStuck = (row: AdminRefundRequest) => {
    if (!token) return;
    void (async () => {
      setBusyId(row.id);
      try {
        await postAdminRefundRetry(token, row.id);
        await load(true);
      } catch (e) {
        Alert.alert('Retry failed', e instanceof Error ? e.message : 'Try again');
      } finally {
        setBusyId(null);
      }
    })();
  };

  return (
    <AdminScreenShell
      title="Orders & refunds"
      subtitle="Triage money and fulfillment issues"
      onBack={() => navigation.goBack()}
      loading={loading}
      error={error}
      onRetry={() => void load()}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load(true);
      }}
    >
      <AdminFilterChips
        options={[
          { id: 'refunds', label: 'Refunds' },
          { id: 'orders', label: 'Orders' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'orders' ? (
        <>
          <AdminFilterChips
            options={[
              { id: 'paid', label: 'Paid' },
              { id: 'pending', label: 'Pending' },
              { id: 'shipped', label: 'Shipped' },
              { id: 'delivered', label: 'Delivered' },
              { id: 'all', label: 'All' },
            ]}
            value={orderStatus}
            onChange={setOrderStatus}
          />
          {orders.length === 0 ? (
            <AdminEmpty message="No orders in this filter." />
          ) : (
            orders.map((o) => (
              <AdminListRow
                key={o.id}
                title={o.listingTitle || o.id}
                meta={`@${o.buyerUsername} → @${o.sellerUsername} · ${formatUsd(o.totalUsd)} · ${new Date(o.createdAt).toLocaleDateString()}`}
                badge={o.status}
                onPress={() => navigation.navigate('AdminOrderDetail', { orderId: o.id })}
              />
            ))
          )}
        </>
      ) : (
        <>
          {stuck.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.live, fontWeight: '800' }}>Stuck refunds</Text>
              {stuck.map((r) => (
                <View key={r.id} style={{ gap: spacing.sm }}>
                  <AdminListRow
                    title={r.listingTitle ?? r.orderId}
                    meta={`@${r.buyerUsername} / @${r.sellerUsername} · ${r.status}`}
                    badge="stuck"
                    badgeWarn
                  />
                  <AdminActionButton
                    label={busyId === r.id ? '…' : 'Retry processing'}
                    disabled={busyId === r.id}
                    onPress={() => retryStuck(r)}
                  />
                </View>
              ))}
            </View>
          ) : null}
          {refunds.length === 0 && stuck.length === 0 ? (
            <AdminEmpty message="No escalated refund requests." />
          ) : (
            refunds.map((r) => (
              <View key={r.id} style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
                <AdminListRow
                  title={r.listingTitle ?? r.orderId}
                  meta={`@${r.buyerUsername} → @${r.sellerUsername} · ${r.kind} · ${r.reason ?? '—'}`}
                  badge={r.status}
                  badgeWarn
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <AdminActionButton
                      label="Approve"
                      tone="success"
                      disabled={busyId === r.id}
                      onPress={() => resolveRefund(r, true)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AdminActionButton
                      label="Deny"
                      tone="danger"
                      disabled={busyId === r.id}
                      onPress={() => resolveRefund(r, false)}
                    />
                  </View>
                </View>
              </View>
            ))
          )}
        </>
      )}
    </AdminScreenShell>
  );
}
