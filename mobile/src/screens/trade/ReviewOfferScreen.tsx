import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TradeFlowHeader } from '../../components/trade/TradeFlowHeader';
import { TradeItemCard } from '../../components/trade/TradeItemCard';
import type { TradeCenterStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { useAuth } from '../../auth/AuthContext';
import { useTradeOffer } from '../../hooks/useTradeOffer';
import { TradeStatusBadge } from '../../components/trade/TradeStatusBadge';
import { listingToTradeItem } from '../../trade/listingToTradeItem';
import { tradeFeeUsdForTier } from '../../lib/tradeFeeAmounts';
import { acceptTradeOfferAsRecipient, cancelTradeOfferAsSender, declineTradeOfferAsRecipient } from '../../api/tradeOffersRepository';
import { isWebTradeApiConfigured } from '../../api/tradeOffersWebApi';
import { isSupabaseConfigured } from '../../lib/supabase';
import { TRADE_FEE_INCLUDES_BULLETS } from '../../data/tradeFeeCopy';

type Props = NativeStackScreenProps<TradeCenterStackParamList, 'ReviewOffer'>;

const SENDER_CANCELLABLE_STATUSES = ['sent', 'awaiting_response', 'countered'] as const;

function UserRow({ label, handle, verified }: { label: string; handle: string; verified: boolean }) {
  return (
    <View style={styles.userRow}>
      <Text style={styles.userLbl}>{label}</Text>
      <View style={styles.userMain}>
        <Text style={styles.userHandle}>{handle}</Text>
        {verified ? (
          <View style={styles.verified}>
            <Ionicons name="checkmark-circle" size={14} color={colors.gold} />
            <Text style={styles.verifiedTxt}>Verified</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function ReviewOfferScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { offer, loading, reload, isStaticMock } = useTradeOffer(route.params.offerId);

  if (loading || !offer) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <TradeFlowHeader navigation={navigation} title="Offer" subtitle={loading ? 'Loading…' : 'Not found'} />
        {!loading ? <Text style={styles.miss}>This offer is no longer available.</Text> : null}
      </View>
    );
  }

  const iAmRecipient = user ? offer.recipient_id === user.id : offer.recipient_id === 'u-me';
  const partner = iAmRecipient ? offer.sender : offer.recipient;
  const you = iAmRecipient ? offer.recipient : offer.sender;
  const partnerHandle = partner.username ? `@${partner.username}` : partner.display_name ?? 'Partner';
  const youHandle = you.username ? `@${you.username}` : you.display_name ?? 'You';
  const verified = (s: string) => s.toLowerCase().includes('verified') || s === 'vaulted_verified';

  const feeYou = tradeFeeUsdForTier(offer.shipping_weight_tier);
  const feeThem = feeYou;

  const accept = async () => {
    try {
      if (user && !isStaticMock && (isWebTradeApiConfigured() || isSupabaseConfigured())) {
        const outcome = await acceptTradeOfferAsRecipient(offer.id, user.id);
        await reload();
        if (outcome === 'fee_due') {
          navigation.navigate('TradeCheckout', { offerId: offer.id });
          return;
        }
        Alert.alert('Offer accepted', 'The other party has been notified. Trade checkout will open here when ready.');
        return;
      }
      navigation.navigate('TradeCheckout', { offerId: offer.id });
    } catch (e) {
      Alert.alert('Could not accept', e instanceof Error ? e.message : 'Try again');
    }
  };

  const decline = async () => {
    try {
      if (user && !isStaticMock && (isWebTradeApiConfigured() || isSupabaseConfigured())) {
        await declineTradeOfferAsRecipient(offer.id, user.id);
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Decline failed', e instanceof Error ? e.message : 'Try again');
    }
  };

  const cancel = async () => {
    if (!user) return;
    try {
      if (!isStaticMock && (isWebTradeApiConfigured() || isSupabaseConfigured())) {
        await cancelTradeOfferAsSender(offer.id, user.id);
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Cancel failed', e instanceof Error ? e.message : 'Try again');
    }
  };

  const senderCanCancel =
    !iAmRecipient && SENDER_CANCELLABLE_STATUSES.includes(offer.status as (typeof SENDER_CANCELLABLE_STATUSES)[number]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <TradeFlowHeader
        navigation={navigation}
        title="Review offer"
        subtitle={iAmRecipient ? 'Incoming trade' : 'Offer you sent'}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.statusRow}>
          <TradeStatusBadge status={offer.status} />
        </View>

        <UserRow label="Partner" handle={partnerHandle} verified={verified(partner.display_name ?? '')} />
        <UserRow label="You" handle={youHandle} verified={verified(you.display_name ?? '')} />

        <View style={styles.divider} />

        <TradeItemCard
          item={listingToTradeItem(offer.requested)}
          caption={iAmRecipient ? 'They want from you' : 'You requested'}
        />

        <Text style={styles.swap}>
          <Ionicons name="swap-vertical" size={18} color={colors.gold} /> For
        </Text>

        {offer.offered.map((item) => (
          <View key={item.id} style={{ marginBottom: spacing.md }}>
            <TradeItemCard item={listingToTradeItem(item)} caption={iAmRecipient ? 'They offer' : 'You offer'} />
          </View>
        ))}

        {offer.message ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteLbl}>Trade note</Text>
            <Text style={styles.noteBody}>{offer.message}</Text>
          </View>
        ) : null}

        <View style={styles.feeCard}>
          <Text style={styles.feeCardKicker}>Get Vaulted trade fee</Text>
          <Text style={styles.feeAmt}>${feeYou.toFixed(2)}</Text>
          <Text style={styles.feeHint}>
            ${feeYou.toFixed(2)} Get Vaulted fee per party. Each of you also pays your own outbound shipping at the
            actual label rate. Partner pays the same platform fee (${feeThem.toFixed(2)}).
          </Text>
        </View>

        <View style={styles.includesBox}>
          <Text style={styles.includesTitle}>How trade costs work</Text>
          {TRADE_FEE_INCLUDES_BULLETS.map((b) => (
            <View key={b} style={styles.bulletRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.goldMuted} />
              <Text style={styles.bulletTxt}>{b}</Text>
            </View>
          ))}
        </View>

        <View style={styles.metaCell}>
          <Text style={styles.metaLbl}>Cash difference (sender → recipient)</Text>
          <Text style={styles.metaVal}>
            {offer.cash_difference >= 0 ? '+' : ''}${offer.cash_difference.toFixed(2)}
          </Text>
          <Text style={styles.feeHint}>
            Settle cash off-platform, or pay on Get Vaulted (Stripe card processing fees apply).
          </Text>
        </View>

        <View style={styles.protect}>
          <Ionicons name="ribbon-outline" size={18} color={colors.gold} />
          <Text style={styles.protectTxt}>
            After you accept, each party pays $2.99 plus their outbound shipping. Labels generate once shipping is paid.
          </Text>
        </View>

        {iAmRecipient && ['sent', 'awaiting_response', 'countered'].includes(offer.status) ? (
          <View style={styles.actions}>
            <Pressable style={styles.primary} onPress={() => void accept()}>
              <Text style={styles.primaryTxt}>Accept trade</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => navigation.navigate('CounterOffer', { offerId: offer.id })}>
              <Text style={styles.secondaryTxt}>Counter offer</Text>
            </Pressable>
            <Pressable
              style={styles.ghost}
              onPress={() =>
                Alert.alert('Decline trade?', 'The other party will be notified.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Decline', style: 'destructive', onPress: () => void decline() },
                ])
              }
            >
              <Text style={styles.ghostTxt}>Decline</Text>
            </Pressable>
          </View>
        ) : !iAmRecipient && offer.status === 'countered' ? (
          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={() => navigation.navigate('CounterOffer', { offerId: offer.id })}>
              <Text style={styles.secondaryTxt}>Send another counter</Text>
            </Pressable>
            <Pressable
              style={styles.ghost}
              onPress={() =>
                Alert.alert('Cancel offer?', 'Your counterparty will be notified that you withdrew this offer.', [
                  { text: 'Keep offer', style: 'cancel' },
                  { text: 'Cancel offer', style: 'destructive', onPress: () => void cancel() },
                ])
              }
            >
              <Text style={styles.ghostTxt}>Cancel offer</Text>
            </Pressable>
            <Text style={styles.waiting}>
              They sent a counter. Revise terms, cancel, or wait for them to accept or decline.
            </Text>
          </View>
        ) : senderCanCancel ? (
          <View style={styles.actions}>
            <Text style={styles.waiting}>Waiting for their response. You can withdraw this offer anytime before they accept.</Text>
            <Pressable
              style={styles.ghost}
              onPress={() =>
                Alert.alert('Cancel offer?', 'Your counterparty will be notified that you withdrew this offer.', [
                  { text: 'Keep offer', style: 'cancel' },
                  { text: 'Cancel offer', style: 'destructive', onPress: () => void cancel() },
                ])
              }
            >
              <Text style={styles.ghostTxt}>Cancel offer</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            <Text style={styles.waiting}>
              Awaiting their response. You will be notified of accept, decline, or counter.
            </Text>
          </View>
        )}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  scroll: { paddingBottom: spacing.xxl, gap: spacing.lg },
  miss: { color: colors.textSecondary, marginTop: spacing.lg },
  statusRow: { alignSelf: 'flex-start' },
  userRow: { gap: 4 },
  userLbl: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  userMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  userHandle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedTxt: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  swap: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noteBox: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  noteLbl: { color: colors.textMuted, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  noteBody: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  feeCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  feeCardKicker: {
    ...typography.micro,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  feeAmt: { color: colors.textPrimary, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  feeHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  includesBox: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  includesTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 14 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bulletTxt: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  metaCell: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  metaLbl: { color: colors.textMuted, fontSize: 11 },
  metaVal: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 4 },
  protect: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  protectTxt: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  actions: { gap: spacing.md, marginTop: spacing.md },
  primary: {
    backgroundColor: colors.gold,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  primaryTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
  secondary: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryTxt: { color: colors.gold, fontWeight: '800', fontSize: 16 },
  ghost: { paddingVertical: spacing.md, alignItems: 'center' },
  ghostTxt: { color: colors.textMuted, fontWeight: '700' },
  waiting: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
});
