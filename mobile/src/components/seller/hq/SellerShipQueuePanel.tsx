import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  createBundledShippingLabel,
  type ManualParcel,
  type SellerLabelPrintFormat,
  type SellerLiveShippingDashboard,
  type SellerLiveShippingSessionRow,
} from '../../../api/sellerLiveShippingRepository';
import {
  createSellerShippingLabel,
  markSellerOrderShipped,
  type SellerSalesOrderRow,
} from '../../../api/sellerSalesRepository';
import {
  orderIdsAwaitingBundledLabel,
  sellerShipQueueEligible,
  sellerShipQueuePhase,
  type SellerShipQueuePhase,
} from '../../../lib/sellerShipQueue';
import { openSellerOrderDetail } from '../../../navigation/openSellerOrderDetail';
import type { RootStackParamList } from '../../../navigation/types';
import { colors, radii, spacing } from '../../../theme';
import { SellerCreateLabelSheet } from '../SellerCreateLabelSheet';
import { SellerMarkShippedSheet } from '../SellerMarkShippedSheet';

type LabelTarget =
  | { kind: 'order'; order: SellerSalesOrderRow }
  | { kind: 'bundle'; session: SellerLiveShippingSessionRow };

function openUrl(url: string) {
  void Linking.openURL(url).catch(() => {
    Alert.alert('Could not open', 'Try again in a moment.');
  });
}

function StagePill({ label, count, tone }: { label: string; count: number; tone: 'sky' | 'gold' | 'amber' | 'emerald' | 'zinc' }) {
  const tones = {
    sky: { border: 'rgba(56,189,248,0.35)', bg: 'rgba(14,116,144,0.18)', text: '#7DD3FC' },
    gold: { border: `${colors.gold}55`, bg: `${colors.gold}18`, text: colors.gold },
    amber: { border: 'rgba(245,158,11,0.35)', bg: 'rgba(120,53,15,0.25)', text: '#FCD34D' },
    emerald: { border: 'rgba(52,211,153,0.35)', bg: 'rgba(6,78,59,0.25)', text: '#6EE7B7' },
    zinc: { border: colors.border, bg: colors.surfaceElevated, text: colors.textSecondary },
  }[tone];
  return (
    <View style={[styles.pill, { borderColor: tones.border, backgroundColor: tones.bg }]}>
      <Text style={[styles.pillTxt, { color: tones.text }]}>
        {label} {count}
      </Text>
    </View>
  );
}

function SectionHeader({ label, count, hint }: { label: string; count: number; hint?: string }) {
  if (count === 0) return null;
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.sectionTitle}>
        {label} <Text style={styles.sectionCount}>({count})</Text>
      </Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

function OrderCard({
  order,
  phase,
  busy,
  onCreateLabel,
  onMarkShipped,
  onShipOwnCarrier,
  onOpen,
}: {
  order: SellerSalesOrderRow;
  phase: Exclude<SellerShipQueuePhase, 'other'>;
  busy: boolean;
  onCreateLabel: () => void;
  onMarkShipped: () => void;
  onShipOwnCarrier?: () => void;
  onOpen: () => void;
}) {
  const buyer = order.buyerUsername ? `@${order.buyerUsername}` : 'Buyer';
  const dest =
    order.shipCity && order.shipState ? `${order.shipCity}, ${order.shipState}` : null;
  const amt = `$${(order.totalCents / 100).toFixed(2)}`;

  return (
    <View style={styles.card}>
      <Pressable onPress={onOpen} style={{ flex: 1, gap: 4 }}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {order.listingTitle}
        </Text>
        <Text style={styles.cardMeta}>
          {buyer}
          {dest ? ` · ${dest}` : ''}
          {order.liveShowTitle ? ` · ${order.liveShowTitle}` : ''}
        </Text>
        {order.trackingNumber ? (
          <Text style={styles.tracking} numberOfLines={1}>
            Tracking {order.trackingNumber}
          </Text>
        ) : null}
      </Pressable>
      <Text style={styles.amt}>{amt}</Text>
      <View style={styles.actions}>
        {phase === 'needs_label' ? (
          <Pressable style={[styles.btn, styles.btnSky]} disabled={busy} onPress={onCreateLabel}>
            <Text style={styles.btnSkyTxt}>{busy ? 'Creating…' : 'Create label'}</Text>
          </Pressable>
        ) : null}
        {phase === 'needs_label' && onShipOwnCarrier ? (
          <Pressable style={[styles.btn, styles.btnMuted]} disabled={busy} onPress={onShipOwnCarrier}>
            <Text style={styles.btnMutedTxt}>Ship it yourself</Text>
          </Pressable>
        ) : null}
        {(phase === 'print_and_ship' || phase === 'awaiting_carrier' || phase === 'in_transit') &&
        order.labelUrl ? (
          <Pressable style={[styles.btn, styles.btnGold]} onPress={() => openUrl(order.labelUrl!)}>
            <Text style={styles.btnGoldTxt}>Print</Text>
          </Pressable>
        ) : null}
        {phase === 'print_and_ship' ? (
          <Pressable style={[styles.btn, styles.btnMuted]} disabled={busy} onPress={onMarkShipped}>
            <Text style={styles.btnMutedTxt}>{busy ? 'Saving…' : 'Dropped off'}</Text>
          </Pressable>
        ) : null}
        {phase === 'awaiting_carrier' ? (
          <Text style={styles.pendingCarrier}>Pending carrier scan</Text>
        ) : null}
        {order.trackingUrl ? (
          <Pressable style={[styles.btn, styles.btnMuted]} onPress={() => openUrl(order.trackingUrl!)}>
            <Text style={styles.btnMutedTxt}>Track</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function BundleCard({
  session,
  busy,
  onCreateLabel,
}: {
  session: SellerLiveShippingSessionRow;
  busy: boolean;
  onCreateLabel: () => void;
}) {
  const buyer = session.buyer.name?.trim()
    ? `${session.buyer.name} (@${session.buyer.username})`
    : `@${session.buyer.username}`;
  const labelUrl = session.bundledLabel?.labelUrl;

  return (
    <View style={[styles.card, styles.bundleCard]}>
      <Text style={styles.bundleKicker}>Live show bundle</Text>
      <Text style={styles.cardTitle}>{session.liveShowTitle}</Text>
      <Text style={styles.cardMeta}>
        {buyer} · {session.orderCount} order{session.orderCount === 1 ? '' : 's'} · {session.itemCount}{' '}
        item{session.itemCount === 1 ? '' : 's'}
      </Text>
      {session.bundledLabel?.trackingNumber ? (
        <Text style={styles.tracking}>Tracking {session.bundledLabel.trackingNumber}</Text>
      ) : null}
      <View style={styles.actions}>
        {session.canCreateBundledLabel ? (
          <Pressable style={[styles.btn, styles.btnSky]} disabled={busy} onPress={onCreateLabel}>
            <Text style={styles.btnSkyTxt}>{busy ? 'Creating…' : 'Create label'}</Text>
          </Pressable>
        ) : null}
        {labelUrl ? (
          <Pressable style={[styles.btn, styles.btnGold]} onPress={() => openUrl(labelUrl)}>
            <Text style={styles.btnGoldTxt}>Print</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function SellerShipQueuePanel({
  accessToken,
  orders,
  liveShipping,
  loading,
  loadedOnce,
  onReload,
  navigation,
}: {
  accessToken?: string;
  orders: SellerSalesOrderRow[];
  liveShipping: SellerLiveShippingDashboard;
  loading: boolean;
  loadedOnce: boolean;
  onReload: () => void | Promise<void>;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const [labelTarget, setLabelTarget] = useState<LabelTarget | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [shipOwnTarget, setShipOwnTarget] = useState<SellerSalesOrderRow | null>(null);

  const awaitingBundleIds = useMemo(
    () => orderIdsAwaitingBundledLabel(liveShipping.sessions),
    [liveShipping.sessions],
  );

  const buckets = useMemo(() => {
    const needsLabel: SellerSalesOrderRow[] = [];
    const pendingShipment: Array<{ order: SellerSalesOrderRow; phase: 'print_and_ship' | 'awaiting_carrier' }> =
      [];
    const shipped: SellerSalesOrderRow[] = [];
    const complete: SellerSalesOrderRow[] = [];
    const waitPayment: SellerSalesOrderRow[] = [];

    for (const order of orders) {
      const q = {
        id: order.id,
        status: order.status,
        paymentStatus: order.paymentStatus ?? '',
        fulfillmentStatus: order.fulfillmentStatus ?? '',
        shippoTransactionId: order.shippoTransactionId ?? null,
        labelUrl: order.labelUrl ?? null,
        trackingNumber: order.trackingNumber ?? null,
      };
      if (!sellerShipQueueEligible(q)) continue;
      const phase = sellerShipQueuePhase(q);
      if (phase === 'needs_label') {
        if (!awaitingBundleIds.has(order.id)) needsLabel.push(order);
      } else if (phase === 'print_and_ship' || phase === 'awaiting_carrier') {
        pendingShipment.push({ order, phase });
      } else if (phase === 'in_transit') {
        shipped.push(order);
      } else if (phase === 'done') {
        complete.push(order);
      } else if (phase === 'wait_payment') {
        waitPayment.push(order);
      }
    }

    complete.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return {
      needsLabel,
      pendingShipment,
      shipped,
      complete: complete.slice(0, 40),
      waitPayment,
    };
  }, [orders, awaitingBundleIds]);

  const createBundles = useMemo(
    () => liveShipping.sessions.filter((s) => s.canCreateBundledLabel),
    [liveShipping.sessions],
  );
  const printBundles = useMemo(
    () =>
      liveShipping.sessions.filter((s) => Boolean(s.bundledLabel?.labelUrl) && !s.canCreateBundledLabel),
    [liveShipping.sessions],
  );

  const needsLabelCount = buckets.needsLabel.length + createBundles.length;
  const pendingShipmentCount = buckets.pendingShipment.length + printBundles.length;
  const setup = liveShipping.labelSetup;

  const confirmCreate = async (
    parcel: ManualParcel,
    labelFormat: SellerLabelPrintFormat,
    selectedRateObjectId?: string,
  ) => {
    if (!accessToken || !labelTarget) return;
    const id =
      labelTarget.kind === 'order' ? labelTarget.order.id : labelTarget.session.sessionId;
    setBusyId(id);
    setFeedback(null);
    try {
      if (labelTarget.kind === 'order') {
        const result = await createSellerShippingLabel(accessToken, labelTarget.order.id, {
          manualParcel: parcel,
          labelFormat,
        });
        if (!result.ok) {
          Alert.alert('Label failed', result.error);
          return;
        }
        if (result.labelUrl) openUrl(result.labelUrl);
      } else {
        const result = await createBundledShippingLabel(accessToken, labelTarget.session.sessionId, {
          manualParcel: parcel,
          labelFormat,
          selectedRateObjectId,
        });
        if (!result.ok) {
          Alert.alert('Bundle label failed', result.error);
          return;
        }
        if (result.warning) setFeedback(result.warning);
        if (result.labelUrl) openUrl(result.labelUrl);
      }
      setLabelTarget(null);
      await onReload();
    } finally {
      setBusyId(null);
    }
  };

  const markShipped = (order: SellerSalesOrderRow) => {
    if (!accessToken) return;
    Alert.alert(
      'Mark dropped off?',
      'Confirms you handed the package to the carrier. Tracking updates when they scan it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dropped off',
          onPress: () => {
            void (async () => {
              setBusyId(order.id);
              const result = await markSellerOrderShipped(
                accessToken,
                order.id,
                order.trackingNumber,
              );
              setBusyId(null);
              if (!result.ok) {
                Alert.alert('Could not update', result.error);
                return;
              }
              await onReload();
            })();
          },
        },
      ],
    );
  };

  const confirmShipOwnCarrier = async (trackingNumber: string | null) => {
    if (!accessToken || !shipOwnTarget) return;
    setBusyId(shipOwnTarget.id);
    try {
      const result = await markSellerOrderShipped(accessToken, shipOwnTarget.id, trackingNumber);
      if (!result.ok) {
        Alert.alert('Could not update', result.error);
        return;
      }
      setShipOwnTarget(null);
      await onReload();
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !loadedOnce) {
    return <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.lg }} />;
  }

  const empty =
    needsLabelCount === 0 &&
    pendingShipmentCount === 0 &&
    buckets.shipped.length === 0 &&
    buckets.complete.length === 0 &&
    buckets.waitPayment.length === 0;

  return (
    <View style={{ gap: spacing.md }}>
      {setup && (!setup.shipFromComplete || !setup.shippoApiOk) ? (
        <View style={styles.setupBanner}>
          <Ionicons name="warning-outline" size={18} color="#FCD34D" />
          <Text style={styles.setupTxt}>
            {!setup.shipFromComplete
              ? setup.shipFromNeedsPhoneOnly
                ? 'Add a ship-from phone number in Seller HQ setup to buy labels.'
                : 'Complete your ship-from address in Seller HQ setup to buy labels.'
              : setup.shippoApiError ?? 'Shipping labels are temporarily unavailable.'}
          </Text>
        </View>
      ) : null}

      <View style={styles.pillRow}>
        <StagePill label="Needs label" count={needsLabelCount} tone="sky" />
        <StagePill label="Pending shipment" count={pendingShipmentCount} tone="gold" />
        <StagePill label="Shipped" count={buckets.shipped.length} tone="amber" />
        <StagePill label="Complete" count={buckets.complete.length} tone="emerald" />
      </View>

      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

      {empty ? (
        <Text style={styles.empty}>
          Shipping queue is clear. New paid orders and live bundles appear here automatically.
        </Text>
      ) : null}

      <SectionHeader
        label="Needs label"
        count={needsLabelCount}
        hint="Buy a label for each package. Live bundles combine orders to the same buyer."
      />
      {createBundles.map((session) => (
        <BundleCard
          key={`create-${session.sessionId}`}
          session={session}
          busy={busyId === session.sessionId}
          onCreateLabel={() => setLabelTarget({ kind: 'bundle', session })}
        />
      ))}
      {buckets.needsLabel.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          phase="needs_label"
          busy={busyId === order.id}
          onCreateLabel={() => setLabelTarget({ kind: 'order', order })}
          onMarkShipped={() => markShipped(order)}
          onShipOwnCarrier={() => setShipOwnTarget(order)}
          onOpen={() => openSellerOrderDetail(navigation, order.id)}
        />
      ))}

      <SectionHeader
        label="Pending shipment"
        count={pendingShipmentCount}
        hint="Print labels, pack, then mark Dropped off when handed to the carrier."
      />
      {printBundles.map((session) => (
        <BundleCard
          key={`print-${session.sessionId}`}
          session={session}
          busy={busyId === session.sessionId}
          onCreateLabel={() => setLabelTarget({ kind: 'bundle', session })}
        />
      ))}
      {buckets.pendingShipment.map(({ order, phase }) => (
        <OrderCard
          key={order.id}
          order={order}
          phase={phase}
          busy={busyId === order.id}
          onCreateLabel={() => setLabelTarget({ kind: 'order', order })}
          onMarkShipped={() => markShipped(order)}
          onOpen={() => openSellerOrderDetail(navigation, order.id)}
        />
      ))}

      <SectionHeader label="Shipped" count={buckets.shipped.length} hint="Carrier has scanned the package." />
      {buckets.shipped.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          phase="in_transit"
          busy={busyId === order.id}
          onCreateLabel={() => {}}
          onMarkShipped={() => {}}
          onOpen={() => openSellerOrderDetail(navigation, order.id)}
        />
      ))}

      <SectionHeader label="Complete" count={buckets.complete.length} />
      {buckets.complete.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          phase="done"
          busy={false}
          onCreateLabel={() => {}}
          onMarkShipped={() => {}}
          onOpen={() => openSellerOrderDetail(navigation, order.id)}
        />
      ))}

      {buckets.waitPayment.length > 0 ? (
        <>
          <SectionHeader
            label="Waiting on payment"
            count={buckets.waitPayment.length}
            hint="Auction wins that still need buyer payment."
          />
          {buckets.waitPayment.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              phase="wait_payment"
              busy={false}
              onCreateLabel={() => {}}
              onMarkShipped={() => {}}
              onOpen={() => openSellerOrderDetail(navigation, order.id)}
            />
          ))}
        </>
      ) : null}

      <SellerCreateLabelSheet
        visible={labelTarget != null}
        title={labelTarget?.kind === 'bundle' ? 'Confirm bundle package' : 'Confirm package details'}
        subtitle={
          labelTarget?.kind === 'bundle'
            ? `${labelTarget.session.liveShowTitle} · ${labelTarget.session.orderCount} orders · est ${labelTarget.session.pricingWeightOz.toFixed(1)} oz`
            : labelTarget?.kind === 'order'
              ? labelTarget.order.listingTitle
              : undefined
        }
        bundleSessionId={labelTarget?.kind === 'bundle' ? labelTarget.session.sessionId : null}
        accessToken={accessToken}
        confirmBusy={busyId != null}
        onClose={() => setLabelTarget(null)}
        onConfirm={(parcel, format, rateId) => {
          void confirmCreate(parcel, format, rateId);
        }}
      />

      <SellerMarkShippedSheet
        visible={shipOwnTarget != null}
        subtitle="Confirms you're shipping this order yourself (no Get Vaulted label). Add your tracking number so the buyer can follow it."
        initialTrackingNumber={shipOwnTarget?.trackingNumber}
        confirmBusy={shipOwnTarget != null && busyId === shipOwnTarget.id}
        onClose={() => setShipOwnTarget(null)}
        onConfirm={(trackingNumber) => void confirmShipOwnCarrier(trackingNumber)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillTxt: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionTitle: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionCount: { color: colors.gold },
  sectionHint: { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  empty: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  setupBanner: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    backgroundColor: 'rgba(120,53,15,0.22)',
  },
  setupTxt: { flex: 1, color: '#FFE4B5', fontSize: 12, lineHeight: 17 },
  feedback: { color: '#6EE7B7', fontSize: 12 },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    gap: 8,
  },
  bundleCard: {
    borderColor: 'rgba(56,189,248,0.3)',
    backgroundColor: 'rgba(14,116,144,0.12)',
  },
  bundleKicker: {
    color: '#7DD3FC',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  cardMeta: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  tracking: { color: colors.textMuted, fontSize: 11, fontFamily: 'monospace' },
  amt: { color: colors.textPrimary, fontSize: 14, fontWeight: '800', position: 'absolute', right: 14, top: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  btnSky: { borderColor: 'rgba(56,189,248,0.45)', backgroundColor: 'rgba(56,189,248,0.16)' },
  btnSkyTxt: { color: '#7DD3FC', fontSize: 12, fontWeight: '800' },
  btnGold: { borderColor: `${colors.gold}66`, backgroundColor: `${colors.gold}18` },
  btnGoldTxt: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  btnMuted: { borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.04)' },
  btnMutedTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  pendingCarrier: { color: '#FCD34D', fontSize: 12, fontWeight: '700', alignSelf: 'center' },
});
