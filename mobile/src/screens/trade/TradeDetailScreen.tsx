import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TradeFlowHeader } from '../../components/trade/TradeFlowHeader';
import { TradeItemCard } from '../../components/trade/TradeItemCard';
import type { TradeCenterStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { useAuth } from '../../auth/AuthContext';
import { useTradeOffer } from '../../hooks/useTradeOffer';
import { fetchShippingLabelsForTrade } from '../../api/tradeOffersRepository';
import type { ShippingLabelVM } from '../../types/tradeOffers';
import { listingToTradeItem } from '../../trade/listingToTradeItem';
import { TRADE_STATUS_LABEL, TRADE_STATUS_ORDER, tradeStatusIndex } from '../../lib/tradeStatusLabels';
import { TradeStatusBadge } from '../../components/trade/TradeStatusBadge';
import { navigateAuthLogin, navigateAuthSignUp } from '../../navigation/rootNavigationRef';
import { openMessageThread } from '../../navigation/openMessages';
import { openContactSupport, openDispute, openUserProfile, openWriteReview } from '../../navigation/openPlatform';
import { ensureTradeConversationViaWeb, confirmTradeReceivedViaWeb, isWebTradeApiConfigured, markTradeShippedViaWeb, openTradeDisputeViaWeb } from '../../api/tradeOffersWebApi';
import { TRADE_AFTER_ACCEPT_NOTE, TRADE_CASH_SETTLEMENT_NOTE, TRADE_FULFILLMENT_NOTE, resolveMobileTradeSecurityDepositUsd } from '../../data/tradeTrustCopy';
import { isTradeCashCheckoutStatus, resolveMobileTradeCashParties } from '../../lib/tradeCashParties';
import { TradeCashPayButton } from '../../components/trade/TradeCashPayButton';
import { TradeDepositPayButton } from '../../components/trade/TradeDepositPayButton';

type Props = NativeStackScreenProps<TradeCenterStackParamList, 'TradeDetail'>;

export function TradeDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const tradeId = route.params.tradeId;
  const { offer, loading, reload } = useTradeOffer(tradeId);
  const [labels, setLabels] = useState<ShippingLabelVM[]>([]);

  const loadLabels = useCallback(async () => {
    if (!tradeId) return;
    const rows = await fetchShippingLabelsForTrade(tradeId);
    setLabels(rows);
  }, [tradeId]);

  useEffect(() => {
    void loadLabels();
  }, [loadLabels, offer?.status]);

  const steps = useMemo(() => {
    if (offer?.status === 'disputed') return TRADE_STATUS_ORDER;
    return TRADE_STATUS_ORDER.filter((s) => s !== 'disputed');
  }, [offer?.status]);

  if (loading || !offer) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <TradeFlowHeader navigation={navigation} title="Trade" subtitle="Loading…" />
        {!loading ? <Text style={styles.miss}>We could not load this trade.</Text> : null}
      </View>
    );
  }

  if (!user?.id) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg }]}>
        <TradeFlowHeader navigation={navigation} title="Trade" subtitle="Account required" />
        <Text style={styles.miss}>Sign in to view trade details and shipping labels.</Text>
        <Pressable style={styles.authCta} onPress={navigateAuthSignUp}>
          <Text style={styles.authCtaTxt}>Create account</Text>
        </Pressable>
        <Pressable style={styles.authSecondary} onPress={navigateAuthLogin}>
          <Text style={styles.authSecondaryTxt}>Log in</Text>
        </Pressable>
      </View>
    );
  }

  const uid = user.id;
  const partner = offer.sender_id === uid ? offer.recipient : offer.sender;
  const partnerHandle = partner.username ? `@${partner.username}` : partner.display_name ?? 'Partner';
  const idx = tradeStatusIndex(offer.status);
  const viewerIsProposer = offer.sender_id === uid;
  const mine = viewerIsProposer ? offer.proposer_fulfillment : offer.recipient_fulfillment;
  const theirs = viewerIsProposer ? offer.recipient_fulfillment : offer.proposer_fulfillment;
  const hasWebFulfillment = Boolean(mine?.label_url || mine?.label_purchased_at || theirs?.label_url || theirs?.tracking_number);
  const showLabels =
    ['labels_generated', 'shipped', 'delivered', 'completed', 'accepted'].includes(offer.status) &&
    (labels.length > 0 || hasWebFulfillment);
  const showLabelError = offer.status === 'label_error' || Boolean(mine?.label_error_message);
  const showFulfillmentActions =
    ['accepted', 'completed'].includes(offer.status) && isWebTradeApiConfigured() && offer.status !== 'disputed';
  const canMarkShipped = Boolean(
    (mine?.label_purchased_at || mine?.label_url) &&
      !mine?.shipped_at &&
      offer.status === 'accepted' &&
      (Math.abs(offer.cash_difference) > 0 ||
        (viewerIsProposer
          ? Boolean(offer.proposer_deposit_paid_at)
          : Boolean(offer.recipient_deposit_paid_at))),
  );
  const canConfirmReceived = Boolean(theirs?.shipped_at && !mine?.received_at && offer.status === 'accepted');

  const openLabel = (url: string | null) => {
    if (!url) {
      Alert.alert('Label', 'No PDF URL yet — check back after Shippo completes.');
      return;
    }
    void Linking.openURL(url);
  };

  const onMarkShipped = () => {
    void (async () => {
      try {
        await markTradeShippedViaWeb(tradeId);
        await reload();
      } catch (e) {
        Alert.alert('Mark shipped', e instanceof Error ? e.message : 'Could not update.');
      }
    })();
  };

  const onConfirmReceived = () => {
    void (async () => {
      try {
        const res = await confirmTradeReceivedViaWeb(tradeId);
        await reload();
        if (res.completed) {
          Alert.alert('Trade completed', 'Both sides confirmed receipt. Held cash (if any) is released to the payee.');
        }
      } catch (e) {
        Alert.alert('Confirm received', e instanceof Error ? e.message : 'Could not update.');
      }
    })();
  };

  const onOpenDispute = () => {
    if (!isWebTradeApiConfigured() || offer.status !== 'accepted') {
      openDispute({ contextType: 'trade', referenceId: tradeId });
      return;
    }
    const submit = (reason: string) => {
      void (async () => {
        try {
          await openTradeDisputeViaWeb(tradeId, reason);
          await reload();
          Alert.alert('Dispute opened', 'Fulfillment and cash release are paused until Get Vaulted resolves this.');
        } catch (e) {
          Alert.alert('Dispute', e instanceof Error ? e.message : 'Could not open dispute.');
        }
      })();
    };
    if (typeof Alert.prompt === 'function') {
      Alert.prompt(
        'Open dispute',
        'Describe the issue. Any held trade cash stays held until resolved.',
        (text) => {
          const reason = (text ?? '').trim();
          if (reason.length < 8) {
            Alert.alert('Dispute', 'Please enter at least 8 characters.');
            return;
          }
          submit(reason);
        },
        'plain-text',
      );
      return;
    }
    Alert.alert('Open dispute', 'Any held trade cash stays held until Get Vaulted resolves this.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Wrong / missing item', onPress: () => submit('Wrong or missing item received') },
      { text: 'Never shipped', onPress: () => submit('Partner never shipped or tracking is inactive') },
      { text: 'Other issue', onPress: () => submit('Other trade fulfillment issue — need support review') },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <TradeFlowHeader navigation={navigation} title="Trade desk" subtitle={partnerHandle} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Text style={styles.pipeTitle}>Status</Text>
          <TradeStatusBadge status={offer.status} />
        </View>

        {offer.status === 'disputed' ? (
          <View style={styles.errorCard}>
            <Ionicons name="shield-outline" size={22} color="#f0a8a8" />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>Dispute open</Text>
              <Text style={styles.errorBody}>
                Shipping confirmations and cash release are paused until Get Vaulted resolves this. Items are not in
                platform custody.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.timeline}>
          {steps.map((s, i) => {
            const done = idx >= 0 && i <= idx;
            const current = i === idx;
            const last = i === steps.length - 1;
            return (
              <View key={s} style={styles.tlRow}>
                <View style={styles.tlGlyph}>
                  <View style={[styles.dot, done && styles.dotOn, current && styles.dotCurrent]} />
                  {!last ? <View style={[styles.stem, i < idx && styles.stemOn]} /> : null}
                </View>
                <Text style={[styles.tlTxt, done && styles.tlTxtOn, current && styles.tlTxtCurrent]}>
                  {TRADE_STATUS_LABEL[s]}
                </Text>
              </View>
            );
          })}
        </View>

        {showLabelError ? (
          <View style={styles.errorCard}>
            <Ionicons name="warning-outline" size={22} color="#f0a8a8" />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>Label generation paused</Text>
              <Text style={styles.errorBody}>{offer.label_error_message ?? 'Unknown error from Shippo pipeline.'}</Text>
              <Text style={styles.errorHint}>
                Retry: re-send the Stripe webhook from the dashboard or run a manual label pass from Netlify. MVP app
                button is a reminder — ops still clears the queue.
              </Text>
              <Pressable
                style={styles.retry}
                onPress={() => {
                  void reload();
                  void loadLabels();
                }}
              >
                <Text style={styles.retryTxt}>Refresh status</Text>
              </Pressable>
              <Pressable style={styles.support} onPress={() => openContactSupport({ category: 'trade', referenceId: tradeId })}>
                <Text style={styles.supportTxt}>Contact support</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Text style={styles.section}>Deal recap</Text>
        <TradeItemCard
          item={listingToTradeItem(offer.sender_id === uid ? offer.offered[0] : offer.requested)}
          caption="You ship"
        />
        <View style={{ height: spacing.md }} />
        <TradeItemCard
          item={listingToTradeItem(offer.sender_id === uid ? offer.requested : offer.offered[0])}
          caption="You receive"
        />

        {showLabels ? (
          <>
            <Text style={styles.section}>Shipping & tracking</Text>
            <Text style={styles.shipLead}>
              Each party pays $2.99 plus their own outbound shipping. Download label PDFs when ready, then mark shipped
              and confirm receipt.
            </Text>
            {labels.length > 0
              ? labels.map((L) => (
                  <ShipCard
                    key={L.id}
                    title={L.user_id === uid ? 'Your outbound label' : 'Their label (reference)'}
                    tracking={L.tracking_number ?? '—'}
                    shipBy={L.ship_by_date ? `Ship by ${L.ship_by_date}` : 'See Shippo ETA'}
                    instructions="Use branded packaging · photo document handoff."
                    carrier={L.carrier ?? '—'}
                    status={L.status}
                    onDownload={() => openLabel(L.label_url)}
                  />
                ))
              : null}
            {labels.length === 0 && hasWebFulfillment ? (
              <>
                {mine?.label_url || mine?.tracking_number ? (
                  <ShipCard
                    title="Your outbound label"
                    tracking={mine?.tracking_number ?? '—'}
                    shipBy={mine?.shipped_at ? 'Marked shipped' : 'Ship with this label'}
                    instructions={TRADE_FULFILLMENT_NOTE}
                    carrier="Shippo"
                    status={mine?.shipped_at ? 'shipped' : 'ready'}
                    onDownload={() => openLabel(mine?.label_url ?? null)}
                  />
                ) : null}
                {theirs?.tracking_number || theirs?.tracking_url ? (
                  <ShipCard
                    title="Partner package"
                    tracking={theirs?.tracking_number ?? '—'}
                    shipBy={theirs?.shipped_at ? 'Partner marked shipped' : 'Label ready'}
                    instructions="Track their outbound package here."
                    carrier="Shippo"
                    status={theirs?.shipped_at ? 'shipped' : 'ready'}
                    onDownload={() => {
                      if (theirs?.tracking_url) void Linking.openURL(theirs.tracking_url);
                      else Alert.alert('Tracking', theirs?.tracking_number ?? 'No tracking URL yet.');
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {showFulfillmentActions ? (
          <View style={styles.fulfillCard}>
            <Text style={styles.section}>Fulfillment</Text>
            <Text style={styles.shipLead}>{TRADE_FULFILLMENT_NOTE}</Text>
            {offer.status === 'completed' ? (
              <Text style={styles.fulfillDone}>Trade completed — both sides confirmed receipt.</Text>
            ) : (
              <View style={styles.fulfillBtns}>
                {mine?.shipped_at ? (
                  <Text style={styles.fulfillDone}>You marked shipped.</Text>
                ) : (
                  <Pressable
                    style={[styles.fulfillBtn, !canMarkShipped && styles.fulfillBtnDisabled]}
                    disabled={!canMarkShipped}
                    onPress={onMarkShipped}
                  >
                    <Text style={styles.fulfillBtnTxt}>Mark shipped</Text>
                  </Pressable>
                )}
                {mine?.received_at ? (
                  <Text style={styles.fulfillDone}>You confirmed receipt.</Text>
                ) : (
                  <Pressable
                    style={[styles.fulfillBtnPrimary, !canConfirmReceived && styles.fulfillBtnDisabled]}
                    disabled={!canConfirmReceived}
                    onPress={onConfirmReceived}
                  >
                    <Text style={styles.fulfillBtnPrimaryTxt}>Confirm received</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.kpi}>
          <Text style={styles.kpiLbl}>Your platform fee (reference)</Text>
          <Text style={styles.kpiVal}>${Number(offer.trade_fee).toFixed(2)}</Text>
          <Text style={[styles.kpiLbl, { marginTop: spacing.md }]}>Cash difference</Text>
          <Text style={styles.kpiVal}>
            {offer.cash_difference >= 0 ? '+' : ''}${offer.cash_difference.toFixed(2)}
          </Text>
          {Math.abs(offer.cash_difference) > 0 ? (
            <Text style={[styles.shipLead, { marginTop: spacing.sm, marginBottom: 0 }]}>
              {offer.cash_paid_at ? 'Cash paid on Get Vaulted.' : TRADE_CASH_SETTLEMENT_NOTE}
            </Text>
          ) : null}
        </View>

        {(() => {
          const cashSides = resolveMobileTradeCashParties(offer);
          const offeredValue = offer.offered.reduce((s, i) => s + (i.price || 0), 0);
          const requestedValue = offer.requested.price || 0;
          const depositAmountUsd = resolveMobileTradeSecurityDepositUsd({
            cashDifference: offer.cash_difference,
            offeredValueUsd: offeredValue,
            requestedValueUsd: requestedValue,
            securityDepositCents: offer.security_deposit_cents,
          });
          const requiresDeposit = depositAmountUsd != null;
          const viewerDepositPaid = viewerIsProposer
            ? Boolean(offer.proposer_deposit_paid_at)
            : Boolean(offer.recipient_deposit_paid_at);
          const canPayCash =
            Boolean(cashSides) &&
            isTradeCashCheckoutStatus(offer.status) &&
            cashSides!.payerUserId === uid;
          return (
            <>
              {requiresDeposit && depositAmountUsd != null && ['accepted', 'completed'].includes(offer.status) ? (
                <TradeDepositPayButton
                  offerId={tradeId}
                  amountUsd={depositAmountUsd}
                  alreadyPaid={viewerDepositPaid}
                  onPaid={() => void reload()}
                />
              ) : null}
              {canPayCash && cashSides ? (
                <TradeCashPayButton
                  offerId={tradeId}
                  amountUsd={cashSides.amountUsd}
                  payeeHandle={
                    (cashSides.payeeUserId === offer.sender_id ? offer.sender : offer.recipient).username
                      ? `@${(cashSides.payeeUserId === offer.sender_id ? offer.sender : offer.recipient).username}`
                      : (cashSides.payeeUserId === offer.sender_id ? offer.sender : offer.recipient)
                          .display_name
                  }
                  alreadyPaid={Boolean(offer.cash_paid_at)}
                  onPaid={() => void reload()}
                />
              ) : null}
            </>
          );
        })()}

        <Pressable
          style={styles.primaryChat}
          onPress={() => {
            void (async () => {
              try {
                if (offer.conversation_id) {
                  openMessageThread(undefined, offer.conversation_id);
                  return;
                }
                if (!isWebTradeApiConfigured()) {
                  Alert.alert('Trade chat', 'Connect to Get Vaulted web API to message about this trade.');
                  return;
                }
                const { threadId } = await ensureTradeConversationViaWeb(tradeId);
                openMessageThread(undefined, threadId);
                await reload();
              } catch (e) {
                Alert.alert('Trade chat', e instanceof Error ? e.message : 'Could not open chat.');
              }
            })();
          }}
        >
          <Ionicons name="chatbubbles-outline" size={18} color={colors.background} />
          <Text style={styles.primaryChatTxt}>
            {offer.conversation_id ? 'Open trade chat' : 'Message about this trade'}
          </Text>
        </Pressable>
        <Text style={styles.chatHint}>{TRADE_AFTER_ACCEPT_NOTE}</Text>

        <Pressable
          style={styles.link}
          onPress={() => navigation.navigate('ReviewOffer', { offerId: tradeId })}
        >
          <Ionicons name="time-outline" size={18} color={colors.gold} />
          <Text style={styles.linkTxt}>View offer history</Text>
        </Pressable>

        <Pressable style={styles.link} onPress={() => openUserProfile(partner.id)}>
          <Ionicons name="person-outline" size={18} color={colors.gold} />
          <Text style={styles.linkTxt}>Partner profile</Text>
        </Pressable>

        <Pressable style={styles.link} onPress={() => openContactSupport({ category: 'trade', referenceId: tradeId })}>
          <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.gold} />
          <Text style={styles.linkTxt}>Contact support</Text>
        </Pressable>

        <Pressable style={styles.link} onPress={onOpenDispute}>
          <Ionicons name="shield-outline" size={18} color={colors.live} />
          <Text style={[styles.linkTxt, { color: colors.live }]}>Open dispute</Text>
        </Pressable>

        {offer.status === 'completed' ? (
          <Pressable
            style={styles.link}
            onPress={() =>
              openWriteReview({
                reviewType: 'trade',
                referenceId: tradeId,
                subjectUserId: partner.id,
                subjectDisplayName: partnerHandle,
              })
            }
          >
            <Ionicons name="star-outline" size={18} color={colors.gold} />
            <Text style={styles.linkTxt}>Leave trade review</Text>
          </Pressable>
        ) : null}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

function ShipCard({
  title,
  tracking,
  shipBy,
  instructions,
  carrier,
  status,
  onDownload,
}: {
  title: string;
  tracking: string;
  shipBy: string;
  instructions: string;
  carrier: string;
  status: string;
  onDownload: () => void;
}) {
  return (
    <View style={styles.ship}>
      <Text style={styles.shipTitle}>{title}</Text>
      <Pressable style={styles.dl} onPress={onDownload}>
        <Ionicons name="download-outline" size={18} color={colors.background} />
        <Text style={styles.dlTxt}>Download label</Text>
      </Pressable>
      <Text style={styles.shipLbl}>Carrier</Text>
      <Text style={styles.shipVal}>{carrier}</Text>
      <Text style={styles.shipLbl}>Tracking number</Text>
      <Text style={styles.shipVal}>{tracking}</Text>
      <Text style={styles.shipLbl}>Ship by</Text>
      <Text style={styles.shipVal}>{shipBy}</Text>
      <Text style={styles.shipLbl}>Label status</Text>
      <Text style={styles.shipVal}>{status}</Text>
      <Text style={styles.shipLbl}>Instructions</Text>
      <Text style={styles.shipBody}>{instructions}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  scroll: { paddingBottom: spacing.xxl, gap: spacing.lg },
  miss: { color: colors.textSecondary, marginTop: spacing.lg },
  authCta: {
    marginTop: spacing.xl,
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  authCtaTxt: { color: colors.background, fontWeight: '800', fontSize: 15 },
  authSecondary: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
  },
  authSecondaryTxt: { color: colors.gold, fontWeight: '800', fontSize: 15 },
  pipeTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  timeline: { marginBottom: spacing.md },
  tlRow: { flexDirection: 'row', gap: spacing.md },
  tlGlyph: { width: 20, alignItems: 'center' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  dotOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.25)' },
  dotCurrent: { backgroundColor: colors.gold },
  stem: { width: 2, flex: 1, minHeight: 18, backgroundColor: colors.border, marginVertical: 2 },
  stemOn: { backgroundColor: 'rgba(212,175,55,0.35)' },
  tlTxt: { flex: 1, color: colors.textMuted, fontSize: 13, paddingBottom: spacing.sm },
  tlTxtOn: { color: colors.textSecondary },
  tlTxtCurrent: { color: colors.textPrimary, fontWeight: '800' },
  errorCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(220,80,80,0.35)',
    backgroundColor: 'rgba(220,80,80,0.08)',
  },
  errorTitle: { color: '#f0a8a8', fontWeight: '800', fontSize: 16 },
  errorBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  errorHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },
  retry: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  retryTxt: { color: colors.background, fontWeight: '800', fontSize: 13 },
  support: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  supportTxt: { color: colors.gold, fontWeight: '700', fontSize: 14 },
  section: {
    ...typography.micro,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  shipLead: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  ship: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  shipTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  dl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    marginVertical: spacing.sm,
  },
  dlTxt: { color: colors.background, fontWeight: '800' },
  shipLbl: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  shipVal: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  shipBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  kpi: {
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  kpiLbl: { color: colors.textMuted, fontSize: 12 },
  kpiVal: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 4 },
  primaryChat: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
  },
  primaryChatTxt: { color: colors.background, fontWeight: '800', fontSize: 15 },
  chatHint: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  linkTxt: { color: colors.gold, fontWeight: '700', fontSize: 14 },
  fulfillCard: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  fulfillBtns: { gap: spacing.sm, marginTop: spacing.sm },
  fulfillBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  fulfillBtnPrimary: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(46,160,90,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(46,160,90,0.45)',
  },
  fulfillBtnDisabled: { opacity: 0.45 },
  fulfillBtnTxt: { color: colors.textPrimary, fontWeight: '800', fontSize: 14 },
  fulfillBtnPrimaryTxt: { color: '#b6f0c8', fontWeight: '800', fontSize: 14 },
  fulfillDone: { color: '#b6f0c8', fontWeight: '700', fontSize: 14 },
});
