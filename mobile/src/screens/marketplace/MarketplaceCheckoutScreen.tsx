import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchBuyerPaymentMethods,
  fetchBuyerShippingAddresses,
  type BuyerPaymentMethodRow,
  type BuyerShippingAddressRow,
} from '../../api/buyerWalletRepository';
import { fetchBuyerLayawayStatus } from '../../api/layawayRepository';
import {
  fetchMarketplaceCheckoutShippingRates,
  fetchMarketplaceCheckoutTaxEstimate,
  startMarketplaceBuyNowCheckout,
  startMarketplaceLayawayCheckout,
  syncMarketplaceBuyNowPayment,
  type MarketplaceCheckoutShipping,
  type MarketplaceCheckoutShippingRate,
} from '../../api/marketplaceCommerceRepository';
import { LiveStripeProvider } from '../../components/live/LiveStripeProvider';
import { fetchMarketplaceListingFromWeb } from '../../api/webListingsRepository';
import { PremiumVaultButton } from '../../components/product/PremiumVaultButton';
import { WalletAddressSetupModal } from '../../components/wallet/WalletAddressSetupModal';
import { WalletPaymentSetupModal } from '../../components/wallet/WalletPaymentSetupStep';
import {
  formatAddressOneLine,
  pickDefaultShippingAddress,
  pickPrimaryPaymentMethod,
} from '../../components/wallet/walletSheetUtils';
import {
  normalizePmType,
  walletPmIcon,
  walletPmSummary,
} from '../../components/wallet/walletPaymentMethodDisplay';
import { useAuth } from '../../auth/AuthContext';
import {
  checkoutRatePreferenceKey,
  getBuyerPreferredShippingRateKey,
  pickCheckoutShippingRate,
  setBuyerPreferredShippingRateKey,
} from '../../lib/buyerShippingPreference';
import { formatListingRatePrice, listingRateLabel } from '../../createListing/shippoRates';
import { openStripeCheckoutSession } from '../../lib/openStripeCheckoutSession';
import { MARKETPLACE_TEXT_PROPS } from '../../lib/marketplaceUiScale';
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

export function MarketplaceCheckoutScreen(props: Props) {
  const { session } = useAuth();
  return (
    <LiveStripeProvider accessToken={session?.access_token}>
      <MarketplaceCheckoutScreenInner {...props} />
    </LiveStripeProvider>
  );
}

function MarketplaceCheckoutScreenInner({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session, user } = useAuth();
  const { confirmPayment } = useStripe();
  const token = session?.access_token;
  const userId = user?.id;
  const { listingId, mode, walletSetupFirst = false } = route.params;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [itemPriceUsd, setItemPriceUsd] = useState(0);
  const [flatShippingUsd, setFlatShippingUsd] = useState(0);
  const [shippingPriceUsd, setShippingPriceUsd] = useState(0);
  const [shippingRates, setShippingRates] = useState<MarketplaceCheckoutShippingRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<BuyerShippingAddressRow[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<BuyerPaymentMethodRow[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [paymentReady, setPaymentReady] = useState(false);
  const [taxUsd, setTaxUsd] = useState(0);
  const [taxCollect, setTaxCollect] = useState(false);
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxNote, setTaxNote] = useState<string | null>(null);
  const [planType, setPlanType] = useState<'thirty_day' | 'sixty_day'>('thirty_day');
  const [termsAcknowledged, setTermsAcknowledged] = useState(false);
  const [layawayBlocked, setLayawayBlocked] = useState<string | null>(null);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [addressPickerExpanded, setAddressPickerExpanded] = useState(false);
  const [paymentPickerExpanded, setPaymentPickerExpanded] = useState(false);
  const [ratesPickerExpanded, setRatesPickerExpanded] = useState(false);
  const [walletSetupPrompted, setWalletSetupPrompted] = useState(false);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null;
  const selectedPaymentMethod =
    paymentMethods.find((pm) => pm.id === selectedPaymentMethodId) ??
    pickPrimaryPaymentMethod(paymentMethods);
  const walletReady = paymentReady && Boolean(selectedAddress) && Boolean(selectedPaymentMethod);
  const shippingPayload = useMemo((): MarketplaceCheckoutShipping | null => {
    if (!selectedAddress) return null;
    return shippingFromAddress(selectedAddress);
  }, [
    selectedAddress?.id,
    selectedAddress?.fullName,
    selectedAddress?.name,
    selectedAddress?.line1,
    selectedAddress?.line2,
    selectedAddress?.city,
    selectedAddress?.state,
    selectedAddress?.postalCode,
    selectedAddress?.country,
  ]);
  const usesFlatShipping = flatShippingUsd > 0;
  const checkoutShippingPayload = useMemo((): MarketplaceCheckoutShipping | null => {
    if (!shippingPayload) return null;
    if (usesFlatShipping) return shippingPayload;
    if (!selectedRateId) return shippingPayload;
    return { ...shippingPayload, selectedShippingRateId: selectedRateId };
  }, [selectedRateId, shippingPayload, usesFlatShipping]);

  const reloadWallet = useCallback(async () => {
    if (!token) return;
    const [pm, addrs] = await Promise.all([
      fetchBuyerPaymentMethods(token),
      fetchBuyerShippingAddresses(token),
    ]);
    const methods = pm.paymentMethods;
    setPaymentMethods(methods);
    setPaymentReady(methods.length > 0);
    setSelectedPaymentMethodId((prev) => {
      if (prev && methods.some((m) => m.id === prev)) return prev;
      return pickPrimaryPaymentMethod(methods)?.id ?? null;
    });
    setAddresses(addrs);
    setSelectedAddressId((prev) => {
      if (prev && addrs.some((a) => a.id === prev)) return prev;
      const preferred = pickDefaultShippingAddress(addrs);
      return preferred?.id ?? addrs[0]?.id ?? null;
    });
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
        const flat = listing.shippingPriceUsd ?? 0;
        setFlatShippingUsd(flat);
        setShippingPriceUsd(flat);
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
    if (loading || walletSetupPrompted || walletReady) return;
    if (!walletSetupFirst) return;
    if (!selectedAddress) {
      setAddressModalOpen(true);
      setWalletSetupPrompted(true);
      return;
    }
    if (!paymentReady) {
      setPaymentModalOpen(true);
      setWalletSetupPrompted(true);
    }
  }, [loading, paymentReady, selectedAddress, walletReady, walletSetupFirst, walletSetupPrompted]);

  useEffect(() => {
    if (!walletSetupPrompted || !selectedAddress || paymentReady) return;
    if (!addressModalOpen && !paymentModalOpen) {
      setPaymentModalOpen(true);
    }
  }, [addressModalOpen, paymentModalOpen, paymentReady, selectedAddress, walletSetupPrompted]);

  const selectShippingRate = useCallback((rate: MarketplaceCheckoutShippingRate) => {
    setSelectedRateId(rate.id);
    void setBuyerPreferredShippingRateKey(userId, checkoutRatePreferenceKey(rate));
    setRatesPickerExpanded(false);
  }, [userId]);

  useEffect(() => {
    if (!token || !shippingPayload || usesFlatShipping) {
      setShippingRates([]);
      setSelectedRateId(null);
      setRatesError(null);
      if (usesFlatShipping) setShippingPriceUsd(flatShippingUsd);
      return;
    }

    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        setRatesLoading(true);
        setRatesError(null);
        try {
          const { rates, error: rateErr } = await fetchMarketplaceCheckoutShippingRates(token, {
            listingId,
            shipping: shippingPayload,
          });
          if (cancelled) return;
          setShippingRates(rates);
          if (rates.length === 0) {
            setRatesError(rateErr ?? 'No shipping options are available for this address yet.');
          } else {
            setRatesError(rateErr);
          }
          const preferredKey = await getBuyerPreferredShippingRateKey(userId);
          const picked = pickCheckoutShippingRate(rates, preferredKey);
          setSelectedRateId((prev) => {
            if (prev && rates.some((r) => r.id === prev)) return prev;
            return picked?.id ?? null;
          });
          if (rates.length > 1) setRatesPickerExpanded(true);
        } catch (e) {
          if (!cancelled) {
            setShippingRates([]);
            setSelectedRateId(null);
            setShippingPriceUsd(0);
            setRatesError(e instanceof Error ? e.message : 'Shipping rates could not be loaded.');
          }
        } finally {
          if (!cancelled) setRatesLoading(false);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [flatShippingUsd, listingId, shippingPayload, token, usesFlatShipping, userId]);

  useEffect(() => {
    if (!usesFlatShipping && selectedRateId) {
      const picked = shippingRates.find((r) => r.id === selectedRateId);
      if (picked) setShippingPriceUsd(Number(picked.amount) || 0);
    }
  }, [selectedRateId, shippingRates, usesFlatShipping]);

  useEffect(() => {
    if (!token || !shippingPayload) return;
    if (!usesFlatShipping && shippingPriceUsd <= 0) {
      setTaxUsd(0);
      setTaxCollect(false);
      setTaxNote(null);
      setTaxLoading(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      setTaxLoading(true);
      void fetchMarketplaceCheckoutTaxEstimate(token, {
        itemPriceUsd,
        shippingPriceUsd,
        shipping: shippingPayload,
      })
        .then((est) => {
          if (cancelled) return;
          setTaxUsd(est.taxUsd);
          setTaxCollect(est.collectTax);
          setTaxNote(est.note);
        })
        .catch(() => {
          if (cancelled) return;
          setTaxUsd(0);
          setTaxCollect(false);
          setTaxNote('Tax calculated at checkout.');
        })
        .finally(() => {
          if (!cancelled) setTaxLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [itemPriceUsd, shippingPayload, shippingPriceUsd, token, usesFlatShipping]);

  const shippingReady = usesFlatShipping || Boolean(selectedRateId);
  const summaryReady = Boolean(shippingPayload) && shippingReady;
  const subtotal = useMemo(() => itemPriceUsd + shippingPriceUsd, [itemPriceUsd, shippingPriceUsd]);
  const total = useMemo(() => subtotal + (taxCollect ? taxUsd : 0), [subtotal, taxCollect, taxUsd]);
  const depositUsd = useMemo(
    () => Math.round(itemPriceUsd * LAYAWAY_DEPOSIT_FRACTION * 100) / 100,
    [itemPriceUsd],
  );

  const selectedRate = shippingRates.find((r) => r.id === selectedRateId) ?? null;
  const showRatePicker =
    ratesPickerExpanded || shippingRates.length > 1 || (shippingRates.length > 0 && !selectedRate);

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
    if (!usesFlatShipping && !selectedRateId) {
      setError(ratesError ?? 'Select a shipping option to continue.');
      return;
    }
    if (!paymentReady || !selectedPaymentMethod) {
      setError('Add a Vault Wallet payment method to continue.');
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
      const payload = checkoutShippingPayload ?? shippingPayload;
      if (mode === 'layaway') {
        const { url } = await startMarketplaceLayawayCheckout(token, {
          listingId,
          planType,
          shipping: payload,
        });
        await openStripeCheckoutSession(url);
        navigation.replace('BuyerLayaways');
        return;
      }

      const result = await startMarketplaceBuyNowCheckout(token, {
        listingId,
        shipping: payload,
        paymentMethodId: selectedPaymentMethod?.id,
      });
      if (!result.ok) {
        if (result.escrowRedirectUrl) {
          await openStripeCheckoutSession(result.escrowRedirectUrl);
          navigation.replace('BuyerOrders');
          return;
        }
        setError(result.error);
        return;
      }
      if ('paid' in result) {
        navigation.replace('BuyerOrders');
        return;
      }
      if ('requiresAction' in result) {
        const conf = await confirmPayment(result.clientSecret, { paymentMethodType: 'Card' });
        if (conf.error) {
          setError(conf.error.message ?? 'Payment verification failed.');
          return;
        }
        const synced = await syncMarketplaceBuyNowPayment(token, result.orderId);
        if (synced.ok && 'paid' in synced) {
          navigation.replace('BuyerOrders');
          return;
        }
        if (synced.ok && 'processing' in synced) {
          Alert.alert('Payment processing', 'Your payment is processing — check Orders for status.');
          navigation.replace('BuyerOrders');
          return;
        }
        setError(!synced.ok ? synced.error : 'Payment is still processing.');
        return;
      }
      if ('processing' in result) {
        Alert.alert('Payment processing', 'Your payment is processing — check Orders for status.');
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

        <View style={styles.walletCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.walletTitle} {...MARKETPLACE_TEXT_PROPS}>
              Vault Wallet
            </Text>
            <Pressable onPress={() => navigation.navigate('BuyerWallet')} hitSlop={8}>
              <Text style={styles.changeLink} {...MARKETPLACE_TEXT_PROPS}>
                Manage
              </Text>
            </Pressable>
          </View>
          <Text style={styles.walletHint} {...MARKETPLACE_TEXT_PROPS}>
            {mode === 'layaway'
              ? 'Use your saved address for shipping. Layaway deposit still completes on Stripe checkout.'
              : 'Pay with your saved Vault Wallet card and ship to a saved address.'}
          </Text>

          <View style={styles.walletOptionBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.walletOptionLabel} {...MARKETPLACE_TEXT_PROPS}>
                Payment
              </Text>
              {paymentReady && paymentMethods.length > 1 ? (
                <Pressable onPress={() => setPaymentPickerExpanded((v) => !v)} hitSlop={8}>
                  <Text style={styles.changeLink} {...MARKETPLACE_TEXT_PROPS}>
                    {paymentPickerExpanded ? 'Done' : 'Change'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {!paymentReady ? (
              <Pressable style={styles.walletOptionRow} onPress={() => setPaymentModalOpen(true)}>
                <Ionicons name="card-outline" size={20} color={colors.gold} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.walletOptionTitle} {...MARKETPLACE_TEXT_PROPS}>
                    Add payment method
                  </Text>
                  <Text style={styles.walletOptionSub} {...MARKETPLACE_TEXT_PROPS}>
                    Save a card to your Vault Wallet
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ) : !paymentPickerExpanded ? (
              <Pressable
                style={[styles.walletOptionRow, styles.walletOptionRowOn]}
                onPress={() => {
                  if (paymentMethods.length > 1) setPaymentPickerExpanded(true);
                  else setPaymentModalOpen(true);
                }}
              >
                <Ionicons
                  name={walletPmIcon(normalizePmType(selectedPaymentMethod?.type))}
                  size={20}
                  color={colors.gold}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.walletOptionTitle} {...MARKETPLACE_TEXT_PROPS}>
                    {walletPmSummary(selectedPaymentMethod)}
                  </Text>
                  <Text style={styles.walletOptionSub} {...MARKETPLACE_TEXT_PROPS}>
                    Vault Wallet · tap to {paymentMethods.length > 1 ? 'change' : 'update'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ) : (
              <>
                {paymentMethods.map((pm) => {
                  const on = selectedPaymentMethodId === pm.id;
                  return (
                    <Pressable
                      key={pm.id}
                      onPress={() => {
                        setSelectedPaymentMethodId(pm.id);
                        setPaymentPickerExpanded(false);
                      }}
                      style={[styles.walletOptionRow, on && styles.walletOptionRowOn]}
                    >
                      <Ionicons
                        name={walletPmIcon(normalizePmType(pm.type))}
                        size={20}
                        color={colors.gold}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.walletOptionTitle} {...MARKETPLACE_TEXT_PROPS}>
                          {walletPmSummary(pm)}
                        </Text>
                      </View>
                      {on ? <Ionicons name="checkmark-circle" size={18} color={colors.gold} /> : null}
                    </Pressable>
                  );
                })}
                <PremiumVaultButton
                  label="Add another card"
                  icon="add-outline"
                  onPress={() => setPaymentModalOpen(true)}
                  variant="secondary"
                />
              </>
            )}
          </View>

          <View style={styles.walletOptionBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.walletOptionLabel} {...MARKETPLACE_TEXT_PROPS}>
                Shipping address
              </Text>
              {selectedAddress && addresses.length > 1 ? (
                <Pressable onPress={() => setAddressPickerExpanded((v) => !v)} hitSlop={8}>
                  <Text style={styles.changeLink} {...MARKETPLACE_TEXT_PROPS}>
                    {addressPickerExpanded ? 'Done' : 'Change'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {!selectedAddress ? (
              <Pressable style={styles.walletOptionRow} onPress={() => setAddressModalOpen(true)}>
                <Ionicons name="location-outline" size={20} color={colors.gold} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.walletOptionTitle} {...MARKETPLACE_TEXT_PROPS}>
                    Add shipping address
                  </Text>
                  <Text style={styles.walletOptionSub} {...MARKETPLACE_TEXT_PROPS}>
                    Required for carrier rates and delivery
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ) : !addressPickerExpanded ? (
              <Pressable
                style={[styles.walletOptionRow, styles.walletOptionRowOn]}
                onPress={() => {
                  if (addresses.length > 1) setAddressPickerExpanded(true);
                  else setAddressModalOpen(true);
                }}
              >
                <Ionicons name="location-outline" size={20} color={colors.gold} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.walletOptionTitle} {...MARKETPLACE_TEXT_PROPS}>
                    {selectedAddress.fullName || selectedAddress.name}
                  </Text>
                  <Text style={styles.walletOptionSub} numberOfLines={2} {...MARKETPLACE_TEXT_PROPS}>
                    {formatAddressOneLine(selectedAddress)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ) : (
              <>
                {addresses.map((addr) => {
                  const on = selectedAddressId === addr.id;
                  return (
                    <Pressable
                      key={addr.id}
                      onPress={() => {
                        setSelectedAddressId(addr.id);
                        setAddressPickerExpanded(false);
                      }}
                      style={[styles.walletOptionRow, on && styles.walletOptionRowOn]}
                    >
                      <Ionicons name="location-outline" size={20} color={colors.gold} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.walletOptionTitle} {...MARKETPLACE_TEXT_PROPS}>
                          {addr.fullName || addr.name}
                        </Text>
                        <Text style={styles.walletOptionSub} numberOfLines={2} {...MARKETPLACE_TEXT_PROPS}>
                          {[addr.line1, addr.city, addr.state, addr.postalCode].filter(Boolean).join(', ')}
                        </Text>
                      </View>
                      {on ? <Ionicons name="checkmark-circle" size={18} color={colors.gold} /> : null}
                    </Pressable>
                  );
                })}
                <PremiumVaultButton
                  label="Add another address"
                  icon="add-outline"
                  onPress={() => setAddressModalOpen(true)}
                  variant="secondary"
                />
              </>
            )}
          </View>

          {walletReady ? (
            <View style={styles.walletReadyPill}>
              <Ionicons name="checkmark-circle" size={14} color="#6ee7b7" />
              <Text style={styles.walletReadyTxt} {...MARKETPLACE_TEXT_PROPS}>
                Vault Wallet ready
              </Text>
            </View>
          ) : null}
        </View>

        {shippingPayload && !usesFlatShipping ? (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionKicker} {...MARKETPLACE_TEXT_PROPS}>
                Shipping
              </Text>
              {selectedRate && !ratesPickerExpanded ? (
                <Pressable onPress={() => setRatesPickerExpanded(true)} hitSlop={8}>
                  <Text style={styles.changeLink} {...MARKETPLACE_TEXT_PROPS}>
                    Change speed
                  </Text>
                </Pressable>
              ) : shippingRates.length > 0 && !selectedRate ? (
                <Pressable onPress={() => setRatesPickerExpanded(true)} hitSlop={8}>
                  <Text style={styles.changeLink} {...MARKETPLACE_TEXT_PROPS}>
                    Choose shipping
                  </Text>
                </Pressable>
              ) : ratesPickerExpanded ? (
                <Pressable onPress={() => setRatesPickerExpanded(false)} hitSlop={8}>
                  <Text style={styles.changeLink} {...MARKETPLACE_TEXT_PROPS}>
                    Done
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {ratesLoading ? (
              <View style={styles.ratesLoading}>
                <ActivityIndicator color={colors.gold} size="small" />
                <Text style={styles.ratesLoadingTxt} {...MARKETPLACE_TEXT_PROPS}>
                  Loading carrier rates for your address…
                </Text>
              </View>
            ) : null}
            {!ratesLoading && ratesError && shippingRates.length === 0 ? (
              <Text style={styles.error} {...MARKETPLACE_TEXT_PROPS}>
                {ratesError}
              </Text>
            ) : null}
            {!ratesPickerExpanded && selectedRate ? (
              <View style={styles.compactCard}>
                <Text style={styles.rateTitle} {...MARKETPLACE_TEXT_PROPS}>
                  {listingRateLabel(selectedRate)}
                </Text>
                <Text style={styles.rateMeta} numberOfLines={2} {...MARKETPLACE_TEXT_PROPS}>
                  {selectedRate.estimatedDelivery}
                </Text>
                <Text style={[styles.ratePrice, { marginTop: spacing.xs }]} {...MARKETPLACE_TEXT_PROPS}>
                  {formatListingRatePrice(selectedRate.amount, selectedRate.currency)}
                </Text>
              </View>
            ) : null}
            {showRatePicker
              ? shippingRates.map((rate) => {
                  const on = selectedRateId === rate.id;
                  return (
                    <Pressable
                      key={rate.id}
                      onPress={() => selectShippingRate(rate)}
                      style={[styles.rateRow, on && styles.rateRowOn]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.rateTitle} {...MARKETPLACE_TEXT_PROPS}>
                          {listingRateLabel(rate)}
                        </Text>
                        <Text style={styles.rateMeta} numberOfLines={2} {...MARKETPLACE_TEXT_PROPS}>
                          {rate.estimatedDelivery}
                        </Text>
                      </View>
                      <Text style={styles.ratePrice} {...MARKETPLACE_TEXT_PROPS}>
                        {formatListingRatePrice(rate.amount, rate.currency)}
                      </Text>
                    </Pressable>
                  );
                })
              : null}
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
            <Text style={styles.summaryLine} {...MARKETPLACE_TEXT_PROPS}>
              Shipping {fmtMoney(shippingPriceUsd)}
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
            {summaryReady && (taxLoading || taxCollect) ? (
              <Text style={styles.summaryLine} {...MARKETPLACE_TEXT_PROPS}>
                {taxLoading
                  ? 'Tax calculating…'
                  : taxUsd > 0
                    ? `Tax ${fmtMoney(taxUsd)}`
                    : taxNote ?? 'Tax added at checkout'}
              </Text>
            ) : null}
            <Text style={styles.totalLine} {...MARKETPLACE_TEXT_PROPS}>
              Total {fmtMoney(summaryReady ? total : itemPriceUsd)}
            </Text>
          </View>
        )}

        {error ? (
          <Text style={styles.error} {...MARKETPLACE_TEXT_PROPS}>
            {error}
          </Text>
        ) : null}

        <PremiumVaultButton
          label={
            submitting
              ? mode === 'layaway'
                ? 'Opening secure checkout…'
                : 'Processing payment…'
              : mode === 'layaway'
                ? 'Pay layaway deposit'
                : 'Confirm purchase'
          }
          icon="lock-closed-outline"
          onPress={() => void completeCheckout()}
          variant="primary"
          disabled={submitting}
        />
        <Text style={styles.stripeNote} {...MARKETPLACE_TEXT_PROPS}>
          {mode === 'layaway'
            ? 'Layaway deposit completes on Stripe secure checkout — your Get Vaulted session stays in the app.'
            : selectedPaymentMethod
              ? `Confirm purchase charges ${walletPmSummary(selectedPaymentMethod)} — no browser redirect.`
              : 'Payment is charged to your saved Vault Wallet card — no browser redirect.'}
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
  walletHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: spacing.sm },
  walletOptionBlock: { gap: spacing.sm, marginTop: spacing.sm },
  walletOptionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  walletOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  walletOptionRowOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  walletOptionTitle: { fontWeight: '800', color: colors.textPrimary, fontSize: 14 },
  walletOptionSub: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  walletReadyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  walletReadyTxt: { fontSize: 11, fontWeight: '800', color: '#6ee7b7', textTransform: 'uppercase' },
  section: { gap: spacing.sm },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionKicker: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  changeLink: { fontSize: 12, fontWeight: '800', color: colors.gold },
  compactCard: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
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
  ratesLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  ratesLoadingTxt: { color: colors.textMuted, fontSize: 12, flex: 1 },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  rateRowOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  rateTitle: { fontWeight: '800', color: colors.textPrimary, fontSize: 14 },
  rateMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  ratePrice: { fontWeight: '900', color: colors.gold, fontSize: 14 },
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
