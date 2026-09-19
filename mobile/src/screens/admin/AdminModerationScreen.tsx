import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import {
  fetchAdminListings,
  patchAdminListing,
  type AdminListingRow,
} from '../../api/adminOpsApi';
import {
  AdminActionButton,
  AdminEmpty,
  AdminFilterChips,
  AdminListRow,
  AdminScreenShell,
  AdminSearchField,
} from '../../components/admin/adminUi';
import type { RootStackParamList } from '../../navigation/types';
import { spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminModeration'>;
type StatusFilter = 'active' | 'removed' | 'all';

export function AdminModerationScreen({ navigation }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [status, setStatus] = useState<StatusFilter>('active');
  const [seller, setSeller] = useState('');
  const [listings, setListings] = useState<AdminListingRow[]>([]);
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
        const data = await fetchAdminListings(token, {
          status: status === 'removed' ? 'removed' : status,
          seller: seller.trim() || undefined,
        });
        // Pending review = active without adminReviewedAt; flag removed separately
        let rows = data.listings;
        if (status === 'active') {
          rows = rows.filter((l) => !l.moderationRemovedAt);
        }
        setListings(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, status, seller],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const act = (row: AdminListingRow, action: 'remove' | 'restore' | 'mark_reviewed') => {
    if (!token) return;
    const label =
      action === 'remove' ? 'Remove listing' : action === 'restore' ? 'Restore listing' : 'Mark reviewed';
    Alert.alert(label, row.title, [
      { text: 'Back', style: 'cancel' },
      {
        text: label,
        style: action === 'remove' ? 'destructive' : 'default',
        onPress: () => {
          void (async () => {
            setBusyId(row.id);
            try {
              await patchAdminListing(token, row.id, action);
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
      title="Moderation"
      subtitle="Pending and flagged marketplace listings"
      onBack={() => navigation.goBack()}
      loading={loading && listings.length === 0}
      error={error && listings.length === 0 ? error : null}
      onRetry={() => void load()}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load(true);
      }}
    >
      <AdminSearchField
        value={seller}
        onChange={setSeller}
        placeholder="Filter by seller username…"
        onSubmit={() => void load()}
      />
      <AdminFilterChips
        options={[
          { id: 'active', label: 'Active' },
          { id: 'removed', label: 'Removed' },
          { id: 'all', label: 'All' },
        ]}
        value={status}
        onChange={setStatus}
      />
      {listings.length === 0 ? (
        <AdminEmpty message="No listings in this filter." />
      ) : (
        listings.map((l) => {
          const pending = !l.adminReviewedAt && !l.moderationRemovedAt;
          return (
            <View key={l.id} style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
              <AdminListRow
                title={l.title}
                meta={`@${l.sellerUsername} · ${l.category} · ${l.priceUsd != null ? `$${l.priceUsd}` : '—'}`}
                badge={l.moderationRemovedAt ? 'removed' : pending ? 'pending' : l.status}
                badgeWarn={Boolean(l.moderationRemovedAt) || pending}
                onPress={() => navigation.navigate('ProductDetail', { productId: l.id })}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {!l.moderationRemovedAt ? (
                  <>
                    <View style={{ flex: 1, minWidth: 100 }}>
                      <AdminActionButton
                        label="Reviewed"
                        tone="success"
                        disabled={busyId === l.id}
                        onPress={() => act(l, 'mark_reviewed')}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 100 }}>
                      <AdminActionButton
                        label="Remove"
                        tone="danger"
                        disabled={busyId === l.id}
                        onPress={() => act(l, 'remove')}
                      />
                    </View>
                  </>
                ) : (
                  <View style={{ flex: 1, minWidth: 100 }}>
                    <AdminActionButton
                      label="Restore"
                      disabled={busyId === l.id}
                      onPress={() => act(l, 'restore')}
                    />
                  </View>
                )}
              </View>
            </View>
          );
        })
      )}
    </AdminScreenShell>
  );
}
