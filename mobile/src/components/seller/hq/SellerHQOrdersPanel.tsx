import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SellerLayawayCounts } from '../../api/layawayRepository';
import type { LiveRoomApiRow } from '../../api/liveRoomsRepository';
import type { SellerSalesOrderRow } from '../../api/sellerSalesRepository';
import { SellerHQLayawaysCard } from './SellerHQLayawaysCard';
import { formatLiveOrderPaymentStatus } from '../../lib/sellerLiveOrders';
import { openSellerOrderDetail } from '../../navigation/openSellerOrderDetail';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type OrdersSubTab = 'live' | 'all';

function fulfillmentLabel(o: SellerSalesOrderRow) {
  const fs = o.fulfillmentStatus ?? '';
  if (fs === 'label_created') return 'Label ready';
  if (fs === 'in_transit') return 'In transit';
  if (fs === 'out_for_delivery') return 'Out for delivery';
  if (fs === 'delivered') return 'Delivered';
  if (o.status === 'shipped') return 'Shipped';
  if (o.paymentStatus === 'paid') return 'Ready to ship';
  return o.status.replace(/_/g, ' ');
}

function OrderRow({
  order,
  navigation,
  showPayment,
}: {
  order: SellerSalesOrderRow;
  navigation: NativeStackNavigationProp<RootStackParamList>;
  showPayment?: boolean;
}) {
  const amt = `$${(order.totalCents / 100).toFixed(2)}`;
  return (
    <View style={styles.orderRow}>
      <Pressable style={{ flex: 1 }} onPress={() => openSellerOrderDetail(navigation, order.id)}>
        <Text style={styles.orderItem}>{order.listingTitle}</Text>
        <Text style={styles.orderBuyer}>
          {order.buyerUsername ? `@${order.buyerUsername}` : 'Buyer'}
          {showPayment ? ` · ${formatLiveOrderPaymentStatus(order.paymentStatus)}` : ` · ${fulfillmentLabel(order)}`}
        </Text>
      </Pressable>
      <View style={styles.orderRowActions}>
        {order.trackingUrl ? (
          <Pressable onPress={() => void Linking.openURL(order.trackingUrl!)}>
            <Text style={styles.orderTrackLink}>Track</Text>
          </Pressable>
        ) : null}
        <Text style={styles.orderAmt}>{amt}</Text>
      </View>
    </View>
  );
}

export function SellerHQOrdersPanel({
  orders,
  ordersLoading,
  ordersLoadedOnce,
  liveOrders,
  liveOrdersLoading,
  liveOrdersLoadedOnce,
  liveRoom,
  layawayCounts,
  layawaysLoading,
  layawaysLoadedOnce,
  hasLayaways,
  onOpenLayaways,
  navigation,
}: {
  orders: SellerSalesOrderRow[];
  ordersLoading: boolean;
  ordersLoadedOnce: boolean;
  liveOrders: SellerSalesOrderRow[];
  liveOrdersLoading: boolean;
  liveOrdersLoadedOnce: boolean;
  liveRoom: LiveRoomApiRow | null;
  layawayCounts: SellerLayawayCounts | null;
  layawaysLoading: boolean;
  layawaysLoadedOnce: boolean;
  hasLayaways: boolean;
  onOpenLayaways: (filter?: 'active' | 'ready' | 'overdue') => void;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const [subTab, setSubTab] = useState<OrdersSubTab>(liveRoom ? 'live' : 'all');

  useEffect(() => {
    if (liveRoom) setSubTab('live');
  }, [liveRoom?.id]);

  const liveTotalUsd = useMemo(
    () => liveOrders.reduce((sum, o) => sum + o.totalCents, 0) / 100,
    [liveOrders],
  );

  const showAllEmpty =
    subTab === 'all' && ordersLoadedOnce && !orders.length && !hasLayaways && layawaysLoadedOnce;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.subTabRow}>
        <Pressable
          style={[styles.subTab, subTab === 'live' && styles.subTabActive]}
          onPress={() => setSubTab('live')}
        >
          <View style={styles.subTabInner}>
            {liveRoom ? <View style={styles.liveDot} /> : null}
            <Text style={[styles.subTabTxt, subTab === 'live' && styles.subTabTxtActive]}>Live orders</Text>
          </View>
        </Pressable>
        <Pressable
          style={[styles.subTab, subTab === 'all' && styles.subTabActive]}
          onPress={() => setSubTab('all')}
        >
          <Text style={[styles.subTabTxt, subTab === 'all' && styles.subTabTxtActive]}>All orders</Text>
        </Pressable>
      </View>

      {subTab === 'live' ? (
        <>
          {liveRoom ? (
            <View style={styles.liveBanner}>
              <Ionicons name="radio-outline" size={18} color={colors.live} />
              <View style={{ flex: 1 }}>
                <Text style={styles.liveBannerTitle}>{liveRoom.title}</Text>
                <Text style={styles.liveBannerSub}>
                  {liveOrders.length} sale{liveOrders.length === 1 ? '' : 's'} · $
                  {liveTotalUsd.toFixed(2)} · updates automatically
                </Text>
              </View>
              <View style={styles.livePill}>
                <Text style={styles.livePillTxt}>LIVE</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.liveHint}>
              Start a Vault Event to track show sales here in real time while you are live.
            </Text>
          )}

          {liveRoom && liveOrdersLoading && !liveOrdersLoadedOnce ? (
            <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.md }} />
          ) : liveRoom && liveOrdersLoadedOnce && liveOrders.length === 0 ? (
            <Text style={styles.orderEmpty}>
              No sales yet this show. Wins and buy-now purchases appear here instantly.
            </Text>
          ) : (
            liveOrders.map((o) => (
              <OrderRow key={o.id} order={o} navigation={navigation} showPayment />
            ))
          )}
        </>
      ) : (
        <>
          <SellerHQLayawaysCard
            counts={layawayCounts}
            loading={layawaysLoading && !layawaysLoadedOnce}
            hasLayaways={hasLayaways}
            onPress={() => onOpenLayaways()}
            onPressFilter={(filter) => onOpenLayaways(filter)}
          />
          {ordersLoading && !ordersLoadedOnce ? (
            <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.md }} />
          ) : showAllEmpty ? (
            <Text style={styles.orderEmpty}>
              No marketplace orders yet. When collectors buy from your vault, fulfillment appears here.
            </Text>
          ) : (
            orders.map((o) => <OrderRow key={o.id} order={o} navigation={navigation} />)
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  subTabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  subTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  subTabActive: { backgroundColor: `${colors.gold}18`, borderWidth: 1, borderColor: `${colors.gold}44` },
  subTabInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subTabTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  subTabTxtActive: { color: colors.gold },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live },
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.35)',
    backgroundColor: 'rgba(255,59,48,0.08)',
  },
  liveBannerTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  liveBannerSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  livePill: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,59,48,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.35)',
  },
  livePillTxt: { color: colors.live, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  liveHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  orderEmpty: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  orderItem: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  orderBuyer: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  orderRowActions: { alignItems: 'flex-end', gap: 4 },
  orderTrackLink: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  orderAmt: { color: colors.gold, fontSize: 15, fontWeight: '800' },
});
