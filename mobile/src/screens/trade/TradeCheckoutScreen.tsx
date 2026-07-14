import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TradeFlowHeader } from '../../components/trade/TradeFlowHeader';
import type { TradeCenterStackParamList } from '../../navigation/types';
import { TRADE_FEE_INCLUDES_BULLETS } from '../../data/tradeFeeCopy';
import { colors, radii, spacing, typography } from '../../theme';
import { useAuth } from '../../auth/AuthContext';
import { useTradeOffer } from '../../hooks/useTradeOffer';
import { postTradeFeeCheckout, getNetlifyFunctionsBase } from '../../lib/netlifyFunctions';
import {
  createTradePlatformFeeCheckoutViaWeb,
  isWebTradeApiConfigured,
} from '../../api/tradeOffersWebApi';
import { TradeStatusBadge } from '../../components/trade/TradeStatusBadge';
import { tradeFeeCentsForTier } from '../../lib/tradeFeeAmounts';

type Props = NativeStackScreenProps<TradeCenterStackParamList, 'TradeCheckout'>;

export function TradeCheckoutScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { offer, loading, reload } = useTradeOffer(route.params.offerId);
  const [paying, setPaying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!offer) return;
    const postPay = ['labels_pending', 'labels_generating', 'labels_generated'].includes(offer.status);
    if (postPay) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => void reload(), 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [offer?.status, offer, reload]);

  if (loading || !offer) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <TradeFlowHeader navigation={navigation} title="Checkout" subtitle="Loading…" />
      </View>
    );
  }

  const amountCents = tradeFeeCentsForTier(offer.shipping_weight_tier);
  const webOk = isWebTradeApiConfigured();
  const netlifyOk = Boolean(getNetlifyFunctionsBase());

  const pay = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Use the Trade Center home screen to authenticate.');
      return;
    }
    setPaying(true);
    try {
      if (webOk) {
        const result = await createTradePlatformFeeCheckoutViaWeb(offer.id);
        if (result.alreadyPaid) {
          Alert.alert('Already paid', 'Your Get Vaulted platform fee is already recorded.');
          await reload();
          return;
        }
        if (!result.url) throw new Error('Checkout URL missing.');
        await WebBrowser.openBrowserAsync(result.url);
        await reload();
        return;
      }
      if (!netlifyOk) {
        Alert.alert(
          'Checkout unavailable',
          'Set EXPO_PUBLIC_WEB_API_BASE (or Netlify functions base) so trade fee checkout can open.',
        );
        return;
      }
      const { url } = await postTradeFeeCheckout({
        tradeOfferId: offer.id,
        userId: user.id,
        amountCents,
      });
      await WebBrowser.openBrowserAsync(url);
      await reload();
    } catch (e) {
      Alert.alert('Checkout failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setPaying(false);
    }
  };

  const pipeline = ['fee_due', 'labels_pending', 'labels_generating', 'label_error', 'labels_generated'] as const;
  const idx = Math.max(0, pipeline.indexOf(offer.status as (typeof pipeline)[number]));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <TradeFlowHeader navigation={navigation} title="Trade checkout" subtitle="Fee + shipping · one charge" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={styles.pipeTitle}>Offer status</Text>
          <TradeStatusBadge status={offer.status} />
        </View>

        <Text style={styles.intro}>
          One Stripe payment covers your $2.99 Get Vaulted fee and your outbound shipping label. Rates are quoted live
          when you tap Pay.
        </Text>

        <View style={styles.pipeline}>
          {pipeline.map((st, i) => {
            const done = idx >= 0 && i <= idx;
            const cur = offer.status === st;
            return (
              <View key={st} style={styles.pipeRow}>
                <View style={[styles.dot, done && styles.dotOn, cur && styles.dotCur]} />
                <Text style={[styles.pipeTxt, done && styles.pipeTxtOn]}>{st.replace(/_/g, ' ')}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <View style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineLbl}>Platform fee (reference)</Text>
              <Text style={styles.hint}>$2.99 + live Shippo label rate — charged together at Stripe.</Text>
            </View>
            <Text style={styles.lineAmt}>${(amountCents / 100).toFixed(2)}+</Text>
          </View>
          <View style={styles.totalRule} />
          <View style={styles.line}>
            <Text style={styles.totalLbl}>Checkout total</Text>
            <Text style={styles.totalAmt}>Quoted in Stripe</Text>
          </View>
        </View>

        <Text style={styles.feeTitle}>How trade costs work</Text>
        {TRADE_FEE_INCLUDES_BULLETS.map((t) => (
          <View key={t} style={styles.bullet}>
            <Ionicons name="ellipse" size={6} color={colors.goldMuted} />
            <Text style={styles.bulletTxt}>{t}</Text>
          </View>
        ))}

        {offer.status === 'labels_generated' ? (
          <Pressable
            style={styles.secondary}
            onPress={() => navigation.replace('TradeDetail', { tradeId: offer.id })}
          >
            <Text style={styles.secondaryTxt}>View labels & tracking</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.primary, (paying || (!webOk && !netlifyOk)) && { opacity: 0.65 }]}
            disabled={paying || (!webOk && !netlifyOk)}
            onPress={() => void pay()}
          >
            {paying ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.primaryTxt}>Pay fee + shipping with Stripe</Text>
            )}
          </Pressable>
        )}

        <Text style={styles.hintFoot}>
          Stripe will show $2.99 plus your outbound label rate as one payment. Your label is purchased automatically
          after payment.
        </Text>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  scroll: { paddingBottom: spacing.xxl, gap: spacing.lg },
  pipeTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  intro: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  pipeline: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  pipeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dotOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.25)' },
  dotCur: { backgroundColor: colors.gold },
  pipeTxt: { color: colors.textMuted, fontSize: 13, textTransform: 'capitalize' },
  pipeTxtOn: { color: colors.textSecondary, fontWeight: '600' },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  lineLbl: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  lineAmt: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  totalRule: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  totalLbl: { flex: 1, color: colors.gold, fontSize: 15, fontWeight: '800' },
  totalAmt: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  feeTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bulletTxt: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  primary: {
    backgroundColor: colors.gold,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  primaryTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
  secondary: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryTxt: { color: colors.gold, fontWeight: '800', fontSize: 16 },
  hintFoot: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});
