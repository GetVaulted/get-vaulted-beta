import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchBuyerPaymentMethods,
  fetchBuyerShippingAddresses,
  type BuyerShippingAddressRow,
} from '../../api/buyerWalletRepository';
import { fetchBuyerLayawayStatus } from '../../api/layawayRepository';
import {
  fetchMarketplaceCheckoutTaxEstimate,
  startMarketplaceBuyNowCheckout,
  startMarketplaceLayawayCheckout,
  type MarketplaceCheckoutShipping,
} from '../../api/marketplaceCommerceRepository';
import { fetchMarketplaceListingFromWeb } from '../../api/webListingsRepository';
import { PremiumVaultButton } from '../../components/product/PremiumVaultButton';
import { WalletAddressSetupModal } from '../../components/wallet/WalletAddressSetupModal';
import { WalletPaymentSetupModal } from '../../components/wallet/WalletPaymentSetupStep';
import { useAuth } from '../../auth/AuthContext';
import { openStripeCheckoutSession } from '../../lib/openStripeCheckoutSession';
import { MARKETPLACE_TEXT_PROPS } from '../../lib/marketplaceUiScale';
import { pickDefaultShippingAddress } from '../../components/wallet/walletSheetUtils';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MarketplaceCheckout'>;

const LAYAWAY_DEPOSIT_FRACTION = 0.25;

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function shippingFromAddress(addr: BuyerShippingAddressRow): MarketplaceCheckoutShipping {
  return {
    buyerAddressId: addr.id,
    shipRecipientName: addr.fullName || addr.name,
    shipAddress: [addr.line1, addr.line2].filter(Boolean).join(' '),
    shipCity: addr.city,
    shipState: addr.state,
    shipZip: addr.postalCode,
    shipCountry: addr.country || 'US',
  };
}

export function MarketplaceCheckoutScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;
  const { listingId, mode } = route.params;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [itemPriceUsd, setItemPriceUsd] = useState(0);
  const [shippingPriceUsd, setShippingPriceUsd] = useState(0);
  const [addresses, setAddresses] = useState<BuyerShippingAddressRow[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [paymentReady, setPaymentReady] = useState(false);
  const [taxUsd, setTaxUsd] = useState(0);
  const [planType, setPlanType] = useState<'thirty_day' | 'sixty_day'>('thirty_day');
  const [termsAcknowledged, setTermsAcknowledged] = useState(false);
  const [layawayBlocked, setLayawayBlocked] = useState<string | null>(null);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null;
  const shippingPayload = selectedAddress ? shippingFromAddress(selectedAddress) : null;

  const reloadWallet = useCallback(async () => {
    if (!token) return;
    const [pm, addrs] = await Promise.all([
      fetchBuyerPaymentMethods(token),
      fetchBuyerShippingAddresses(token),
    ]);
    setPaymentReady(pm.paymentMethods.length > 0);
    setAddresses(addrs);
    const preferred = pickDefaultShippingAddress(addrs);
    setSelectedAddressId(preferred?.id ?? addrs[0]?.id ?? null);
  }, [token]);

  useEffect(() => {
    if (!token) {
      navigation.replace('AuthLogin');
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const listing = await fetchMarketplaceListingFromWeb(listingId);
        if (!listing || cancelled) {
          if (!cancelled) setError('Listing not found.');
          return;
        }
        setTitle(listing.title);
        setImageUrl(listing.imageUrls?.[0] ?? null);
        setItemPriceUsd(listing.price);
        setShippingPriceUsd(listing.shippingPriceUsd ?? 0);
        await reloadWallet();
        if (mode === 'layaway') {
          const blocked = await fetchBuyerLayawayStatus(token);
          if (blocked) {
            setLayawayBlocked(
              'You already have an active layaway. Complete or default it before starting another.',
            );
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load checkout.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId, mode, navigation, reloadWallet, token]);

  useEffect(() => {
    if (!token || !shippingPayload || mode !== 'buy_now') return;
    const t = setTimeout(() => {
      void fetchMarketplaceCheckoutTaxEstimate(token, {
        itemPriceUsd,
        shippingPriceUsd,
        shipping: shippingPayload,
      }).then((est) => setTaxUsd(est.taxUsd));
    }, 400);
    return () => clearTimeout(t);
  }, [itemPriceUsd, mode, shippingPayload, shippingPriceUsd, token]);

  const subtotal = useMemo(() => itemPriceUsd + shippingPriceUsd, [itemPriceUsd, shippingPriceUsd]);
  const total = useMemo(() => subtotal + taxUsd, [subtotal, taxUsd]);
  const depositUsd = useMemo(
    () => Math.round(itemPriceUsd * LAYAWAY_DEPOSIT_FRACTION * 100) / 100,
    [itemPriceUsd],
  );

  const completeCheckout = async () => {
    if (!token) {
      navigation.navigate('AuthLogin');
      return;
    }
    if (!shippingPayload) {
      setError('Add a shipping address to continue.');
      setAddressModalOpen(true);
      return;
    }
    if (!paymentReady) {
      setError('Add a payment method to continue.');
      setPaymentModalOpen(true);
      return;
    }
    if (mode === 'layaway') {
      if (layawayBlocked) {
        setError(layawayBlocked);
        return;
      }
      if (!termsAcknowledged) {
        setError('Acknowledge layaway terms to continue.');
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const stripeUrl =
        mode === 'layaway'
          ? (
              await startMarketplaceLayawayCheckout(token, {
                listingId,
                planType,
                shipping: shippingPayload,
              })
            ).url
          : await startMarketplaceBuyNowCheckout(token, {
              listingId,
              shipping: shippingPayload,
            });

      await openStripeCheckoutSession(stripeUrl);
      if (mode === 'layaway') {
        navigation.replace('BuyerLayaways');
      } else {
        navigation.replace('BuyerOrders');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.gold} size="large" />
        <Text style={styles.loadingHint} {...MARKETPLACE_TEXT_PROPS}>
          Preparing checkout…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.topTitle} {...MARKETPLACE_TEXT_PROPS}>
          {mode === 'layaway' ? 'Layaway checkout' : 'Buy now checkout'}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.itemCard}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, { backgroundColor: colors.surfaceElevated }]} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.itemTitle} numberOfLines={2} {...MARKETPLACE_TEXT_PROPS}>
              {title}
            </Text>
            <Text style={styles.itemPrice} {...MARKETPLACE_TEXT_PROPS}>
              {fmtMoney(itemPriceUsd)}
            </Text>
          </View>
        </View>

        {!paymentReady || !selectedAddress ? (
          <View style={styles.walletCard}>
            <Text style={styles.walletTitle} {...MARKETPLACE_TEXT_PROPS}>
              Wallet setup
            </Text>
            {!selectedAddress ? (
              <PremiumVaultButton
                label="Add shipping address"
                icon="location-outline"
                onPress={() => setAddressModalOpen(true)}
                variant="secondary"
              />
            ) : null}
            {!paymentReady ? (
              <PremiumVaultButton
                label="Add payment method"
                icon="card-outline"
                onPress={() => setPaymentModalOpen(true)}
                variant="secondary"
              />
            ) : null}
          </View>
        ) : null}

        {addresses.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionKicker} {...MARKETPLACE_TEXT_PROPS}>
              Ship to
            </Text>
            {addresses.map((addr) => (
              <Pressable
                key={addr.id}
                onPress={() => setSelectedAddressId(addr.id)}
                style={[styles.addrRow, selectedAddressId === addr.id && styles.addrRowOn]}
              >
                <Text style={styles.addrName} {...MARKETPLACE_TEXT_PROPS}>
                  {addr.fullName || addr.name}
                </Text>
                <Text style={styles.addrLine} numberOfLines={2} {...MARKETPLACE_TEXT_PROPS}>
                  {[addr.line1, addr.city, addr.state, addr.postalCode].filter(Boolean).join(', ')}
                </Text>
              </Pressable>
            ))}
            <PremiumVaultButton
              label="Add another address"
              onPress={() => setAddressModalOpen(true)}
              variant="secondary"
            />
          </View>
        ) : null}

        {mode === 'layaway' ? (
          <View style={styles.section}>
            <Text style={styles.sectionKicker} {...MARKETPLACE_TEXT_PROPS}>
              Layaway plan
            </Text>
            <View style={styles.planRow}>
              <Pressable
                onPress={() => setPlanType('thirty_day')}
                style={[styles.planPill, planType === 'thirty_day' && styles.planPillOn]}
              >
                <Text style={styles.planTxt} {...MARKETPLACE_TEXT_PROPS}>
                  30-day
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setPlanType('sixty_day')}
                style={[styles.planPill, planType === 'sixty_day' && styles.planPillOn]}
              >
                <Text style={styles.planTxt} {...MARKETPLACE_TEXT_PROPS}>
                  60-day
                </Text>
              </Pressable>
            </View>
            <Text style={styles.summaryLine} {...MARKETPLACE_TEXT_PROPS}>
              Deposit today: {fmtMoney(depositUsd)}
            </Text>
            <Pressable onPress={() => setTermsAcknowledged((v) => !v)} style={styles.termsRow}>
              <Ionicons
                name={termsAcknowledged ? 'checkbox' : 'square-outline'}
                size={20}
                color={colors.gold}
              />
              <Text style={styles.termsTxt} {...MARKETPLACE_TEXT_PROPS}>
                I acknowledge layaway terms — deposit is non-refundable.
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionKicker} {...MARKETPLACE_TEXT_PROPS}>
              Order summary
            </Text>
            <Text style={styles.summaryLine} {...MARKETPLACE_TEXT_PROPS}>
              Item {fmtMoney(itemPriceUsd)}
            </Text>
            <Text style={styles.summaryLine} {...MARKETPLACE_TEXT_PROPS}>
              Shipping {fmtMoney(shippingPriceUsd)}
            </Text>
            {taxUsd > 0 ? (
              <Text style={styles.summaryLine} {...MARKETPLACE_TEXT_PROPS}>
                Tax {fmtMoney(taxUsd)}
              </Text>
            ) : null}
            <Text style={styles.totalLine} {...MARKETPLACE_TEXT_PROPS}>
              Total {fmtMoney(total)}
            </Text>
          </View>
        )}

        {error ? (
          <Text style={styles.error} {...MARKETPLACE_TEXT_PROPS}>
            {error}
          </Text>
        ) : null}

        <PremiumVaultButton
          label={submitting ? 'Opening secure checkout…' : mode === 'layaway' ? 'Pay layaway deposit' : 'Pay with Vaulted checkout'}
          icon="lock-closed-outline"
          onPress={() => void completeCheckout()}
          variant="primary"
          disabled={submitting}
        />
        <Text style={styles.stripeNote} {...MARKETPLACE_TEXT_PROPS}>
          Payment completes on Stripe secure checkout — your Get Vaulted session stays in the app.
        </Text>
      </ScrollView>

      <WalletAddressSetupModal
        visible={addressModalOpen}
        accessToken={token}
        onClose={() => setAddressModalOpen(false)}
        onSaved={() => {
          setAddressModalOpen(false);
          void reloadWallet();
        }}
      />
      <WalletPaymentSetupModal
        visible={paymentModalOpen}
        accessToken={token}
        onClose={() => setPaymentModalOpen(false)}
        onSaved={() => {
          setPaymentModalOpen(false);
          void reloadWallet();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  loadingHint: { color: colors.textMuted, fontWeight: '600' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: colors.textPrimary, textTransform: 'uppercase' },
  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
  itemCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  thumb: { width: 88, height: 88, borderRadius: radii.md },
  itemTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  itemPrice: { fontSize: 18, fontWeight: '900', color: colors.gold, marginTop: 4 },
  walletCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.06)',
    gap: spacing.sm,
  },
  walletTitle: { fontSize: 12, fontWeight: '800', color: colors.gold, letterSpacing: 0.8, textTransform: 'uppercase' },
  section: { gap: spacing.sm },
  sectionKicker: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  addrRow: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  addrRowOn: { borderColor: colors.gold },
  addrName: { fontWeight: '800', color: colors.textPrimary, fontSize: 14 },
  addrLine: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  planRow: { flexDirection: 'row', gap: spacing.sm },
  planPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  planPillOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.1)' },
  planTxt: { fontWeight: '800', color: colors.textPrimary },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.xs },
  termsTxt: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  summaryLine: { color: colors.textSecondary, fontSize: 14 },
  totalLine: { color: colors.gold, fontSize: 18, fontWeight: '900', marginTop: spacing.xs },
  error: { color: '#FF8A80', fontSize: 13, fontWeight: '600' },
  stripeNote: { color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
