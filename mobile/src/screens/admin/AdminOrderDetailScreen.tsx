import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { fetchAdminOrder } from '../../api/adminOpsApi';
import { AdminScreenShell } from '../../components/admin/adminUi';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminOrderDetail'>;

function pickStr(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '—';
}

export function AdminOrderDetailScreen({ navigation, route }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
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
      const data = await fetchAdminOrder(token, route.params.orderId);
      setOrder(data.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, route.params.orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const buyer = (order?.buyer as Record<string, unknown> | undefined) ?? {};
  const seller = (order?.seller as Record<string, unknown> | undefined) ?? {};
  const listing = (order?.listing as Record<string, unknown> | undefined) ?? {};

  return (
    <AdminScreenShell
      title="Order"
      subtitle={route.params.orderId}
      onBack={() => navigation.goBack()}
      loading={loading}
      error={error}
      onRetry={() => void load()}
    >
      {order ? (
        <View style={{ gap: spacing.md }}>
          <Row label="Status" value={pickStr(order, 'status')} />
          <Row label="Total" value={`$${pickStr(order, 'totalUsd')}`} />
          <Row label="Listing" value={pickStr(listing, 'title')} />
          <Row label="Buyer" value={`@${pickStr(buyer, 'username')}`} />
          <Row label="Seller" value={`@${pickStr(seller, 'username')}`} />
          <Row label="Payment" value={pickStr(order, 'paymentStatus') || pickStr(order, 'stripePaymentIntentId')} />
          <Row label="Fulfillment" value={pickStr(order, 'fulfillmentStatus')} />
          <Row label="Escrow" value={pickStr(order, 'escrowStatus')} />
          <Row label="Payout" value={pickStr(order, 'payoutStatus')} />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.md }}>
            Deep escrow/payout controls remain on web Ops for now. Use refunds tab for escalated refunds.
          </Text>
        </View>
      ) : null}
    </AdminScreenShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{value || '—'}</Text>
    </View>
  );
}
