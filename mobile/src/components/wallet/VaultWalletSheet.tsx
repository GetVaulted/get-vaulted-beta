import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createBuyerShippingAddress,
  deleteBuyerPaymentMethod,
  deleteBuyerShippingAddress,
  fetchBuyerShippingAddresses,
  fetchBuyerWalletReadiness,
  fetchBuyerWalletSummary,
  setBuyerDefaultPaymentMethod,
  updateBuyerShippingAddress,
  type BuyerPaymentMethodRow,
  type BuyerShippingAddressRow,
  type BuyerWalletSummary,
  type CreateShippingAddressInput,
} from '../../api/buyerWalletRepository';
import type { BuyerWalletReadiness } from '../../lib/buyerWalletErrors';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from '../live/LiveRoomText';
import { logWalletSheet, useKeyboardInset } from './walletSheetKeyboard';
import { WalletPaymentSetupModal } from './WalletPaymentSetupStep';
import { vaultWalletTheme as t } from './vaultWalletTheme';
import {
  formatAddressBlock,
  formatAddressOneLine,
  formatCardExp,
  pickDefaultShippingAddress,
  pickPrimaryPaymentMethod,
} from './walletSheetUtils';
import {
  formatUsd,
  walletPmIcon,
  walletPmLabel,
  walletPmSummary,
  normalizePmType,
} from './walletPaymentMethodDisplay';
import { WalletNativePayButton } from './WalletNativePayButton';
import {
  WALLET_MARKETPLACE_BNPL_CATALOG,
  WALLET_SAVABLE_METHOD_CATALOG,
  shouldShowWalletCatalogEntry,
  walletMethodEligibilityLabel,
} from '../../lib/paymentMethodCatalog';

export type WalletStep =
  | 'main'
  | 'shipping'
  | 'addresses'
  | 'addressForm'
  | 'payment'
  | 'credits'
  | 'promo'
  | 'referral';

type Props = {
  visible: boolean;
  onClose: () => void;
  accessToken?: string;
  roomId: string;
  initialReadiness?: BuyerWalletReadiness | null;
  onReadinessChange?: (readiness: BuyerWalletReadiness) => void;
  onActiveChange?: (active: boolean) => void;
  recoveryMode?: boolean;
  initialStep?: WalletStep;
  openPaymentSetupOnMount?: boolean;
  onPaymentMethodSaved?: (paymentMethodId?: string) => void;
};

const EMPTY_ADDRESS: CreateShippingAddressInput = {
  name: 'Shipping',
  fullName: '',
  line1: '',
  line2: null,
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
  isDefault: true,
};

function SheetHeader({
  title,
  onBack,
  rightSlot,
}: {
  title: string;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
}) {
  return (
    <View style={t.headerRow}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={t.headerSpacer}>
          <Ionicons name="chevron-back" size={24} color={colors.gold} />
        </Pressable>
      ) : (
        <View style={t.headerSpacer} />
      )}
      <LiveRoomText style={t.headerTitle}>{title}</LiveRoomText>
      {rightSlot ?? <View style={t.headerSpacer} />}
    </View>
  );
}

function SectionRow({
  icon,
  title,
  subtitle,
  trailing,
  missing,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  trailing?: string;
  missing?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [t.sectionCard, pressed && t.sectionCardPressed]}
      onPress={onPress}
    >
      <View style={t.sectionIcon}>
        <Ionicons name={icon} size={20} color={colors.gold} />
      </View>
      <View style={t.sectionBody}>
        <LiveRoomText style={t.sectionTitle}>{title}</LiveRoomText>
        <LiveRoomText style={missing ? t.sectionSubWarn : t.sectionSub} numberOfLines={2}>
          {subtitle}
        </LiveRoomText>
      </View>
      {trailing ? <LiveRoomText style={t.sectionAmount}>{trailing}</LiveRoomText> : null}
      <Ionicons name="chevron-forward" size={18} color="#fff" style={t.chevron} />
    </Pressable>
  );
}

export function VaultWalletSheet({
  visible,
  onClose,
  accessToken,
  roomId,
  initialReadiness,
  onReadinessChange,
  onActiveChange,
  recoveryMode = false,
  initialStep = 'main',
  openPaymentSetupOnMount = false,
  onPaymentMethodSaved,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  void useKeyboardInset();
  const sheetMaxHeight = Math.min(windowHeight * 0.92, 720);
  const safeBottom = Math.max(insets.bottom, spacing.lg);

  const [step, setStep] = useState<WalletStep>(() =>
    recoveryMode && initialStep ? initialStep : 'main',
  );
  const [paymentSetupOpen, setPaymentSetupOpen] = useState(
    () => recoveryMode && openPaymentSetupOnMount,
  );
  const [addressFormDraft, setAddressFormDraft] = useState<CreateShippingAddressInput>(EMPTY_ADDRESS);
  const [addressFormEditing, setAddressFormEditing] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressFormBusy, setAddressFormBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [readiness, setReadiness] = useState<BuyerWalletReadiness | null>(initialReadiness ?? null);
  const [summary, setSummary] = useState<BuyerWalletSummary | null>(null);
  const [addresses, setAddresses] = useState<BuyerShippingAddressRow[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [promoDraft, setPromoDraft] = useState('');
  const openSeedAppliedRef = useRef(false);
  const loadInFlight = useRef(false);
  const wasVisibleRef = useRef(false);
  const addressFormReturnStep = useRef<WalletStep>('shipping');

  const paymentMethods = summary?.paymentMethods ?? [];
  const defaultAddress = pickDefaultShippingAddress(addresses);
  const primaryPayment = pickPrimaryPaymentMethod(paymentMethods);
  const paymentReady = readiness?.paymentReady === true;
  const shippingReady = readiness?.shippingReady === true;
  const walletReady = paymentReady && shippingReady;

  const loadWalletData = useCallback(async () => {
    if (!accessToken || loadInFlight.current) return;
    loadInFlight.current = true;
    setLoading(true);
    setActionError(null);
    logWalletSheet('refresh start');
    try {
      const [nextReadiness, walletSummary, addrList] = await Promise.all([
        fetchBuyerWalletReadiness(accessToken, roomId),
        fetchBuyerWalletSummary(accessToken).catch(() => null),
        fetchBuyerShippingAddresses(accessToken).catch(() => [] as BuyerShippingAddressRow[]),
      ]);
      if (nextReadiness) {
        setReadiness(nextReadiness);
        onReadinessChange?.(nextReadiness);
      }
      if (walletSummary) setSummary(walletSummary);
      setAddresses(addrList);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not refresh wallet.');
    } finally {
      loadInFlight.current = false;
      setLoading(false);
      logWalletSheet('refresh end');
    }
  }, [accessToken, onReadinessChange, roomId]);

  const loadRef = useRef(loadWalletData);
  loadRef.current = loadWalletData;

  useEffect(() => {
    onActiveChange?.(visible);
    return () => onActiveChange?.(false);
  }, [visible, onActiveChange]);

  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      setStep('main');
      setPaymentSetupOpen(false);
      setEditingAddressId(null);
      setActionError(null);
      openSeedAppliedRef.current = false;
      return;
    }

    const justOpened = !wasVisibleRef.current;
    wasVisibleRef.current = true;
    if (!justOpened) return;

    if (initialReadiness) {
      setReadiness(initialReadiness);
      openSeedAppliedRef.current = true;
    }
    setStep(recoveryMode ? initialStep : 'main');
    if (recoveryMode && openPaymentSetupOnMount) setPaymentSetupOpen(true);
    void loadRef.current();
  }, [visible, recoveryMode, initialStep, openPaymentSetupOnMount, initialReadiness]);

  const goMain = () => setStep('main');
  const openPaymentSetup = () => setPaymentSetupOpen(true);

  const openAddressForm = (seed?: BuyerShippingAddressRow, returnStep: WalletStep = 'shipping') => {
    addressFormReturnStep.current = returnStep;
    if (seed) {
      setEditingAddressId(seed.id);
      setAddressFormDraft({
        name: seed.name,
        fullName: seed.fullName,
        line1: seed.line1,
        line2: seed.line2,
        city: seed.city,
        state: seed.state,
        postalCode: seed.postalCode,
        country: seed.country,
        isDefault: seed.isDefault !== false,
      });
      setAddressFormEditing(true);
    } else {
      setEditingAddressId(null);
      setAddressFormDraft(EMPTY_ADDRESS);
      setAddressFormEditing(false);
    }
    setStep('addressForm');
  };

  const saveAddressForm = async () => {
    if (!accessToken || addressFormBusy) return;
    setAddressFormBusy(true);
    setActionError(null);
    try {
      if (addressFormEditing && editingAddressId?.trim()) {
        await updateBuyerShippingAddress(accessToken, editingAddressId, addressFormDraft);
      } else {
        await createBuyerShippingAddress(accessToken, addressFormDraft);
      }
      await loadWalletData();
      setStep(addressFormReturnStep.current);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not save address.');
    } finally {
      setAddressFormBusy(false);
    }
  };

  const handleSetDefaultPm = async (pm: BuyerPaymentMethodRow) => {
    if (!accessToken || pm.isDefault) return;
    try {
      await setBuyerDefaultPaymentMethod(accessToken, pm.id);
      await loadWalletData();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not set default.');
    }
  };

  const handleRemovePm = (pm: BuyerPaymentMethodRow) => {
    Alert.alert('Remove payment method', `Remove ${walletPmLabel(pm)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!accessToken) return;
            try {
              await deleteBuyerPaymentMethod(accessToken, pm.id);
              await loadWalletData();
            } catch (e) {
              setActionError(e instanceof Error ? e.message : 'Could not remove.');
            }
          })();
        },
      },
    ]);
  };

  const handleRemoveAddress = (addr: BuyerShippingAddressRow) => {
    Alert.alert('Remove address', `Remove ${addr.fullName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!accessToken) return;
            try {
              await deleteBuyerShippingAddress(accessToken, addr.id);
              await loadWalletData();
            } catch (e) {
              setActionError(e instanceof Error ? e.message : 'Could not remove.');
            }
          })();
        },
      },
    ]);
  };

  const finishWalletSetup = () => {
    if (loading) return;
    if (!shippingReady) {
      setStep('shipping');
      return;
    }
    if (!paymentReady) {
      setStep('payment');
      return;
    }
    onClose();
  };

  const creditsUsd = summary?.vaultCreditsUsd ?? 0;
  const referralUsd = summary?.referralCreditUsd ?? 0;

  const renderMain = () => (
    <>
      <View style={t.hero}>
        <View style={t.heroIcon}>
          <Ionicons name="wallet" size={24} color={colors.gold} />
        </View>
        <LiveRoomText style={t.heroTitle}>Vault Wallet</LiveRoomText>
        <LiveRoomText style={t.heroSub}>
          Your shipping, payments, and credits for live shows, marketplace, offers, and trades.
        </LiveRoomText>
        <View style={[t.readinessPill, walletReady ? t.readinessReady : t.readinessSetup]}>
          <Ionicons
            name={walletReady ? 'checkmark-circle' : 'alert-circle-outline'}
            size={14}
            color={walletReady ? '#6ee7b7' : colors.gold}
          />
          <LiveRoomText style={[t.readinessTxt, walletReady ? t.readinessTxtReady : t.readinessTxtSetup]}>
            {walletReady ? 'Ready to bid & buy' : 'Setup required'}
          </LiveRoomText>
        </View>
      </View>
      {actionError ? <LiveRoomText style={t.errorText}>{actionError}</LiveRoomText> : null}
      <ScrollView
        contentContainerStyle={t.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SectionRow
          icon="location-outline"
          title="Shipping Address"
          subtitle={formatAddressOneLine(defaultAddress)}
          missing={!shippingReady}
          onPress={() => setStep('shipping')}
        />
        <SectionRow
          icon="card-outline"
          title="Payment Methods"
          subtitle={walletPmSummary(primaryPayment)}
          missing={!paymentReady}
          onPress={() => setStep('payment')}
        />
        <SectionRow
          icon="diamond-outline"
          title="Vault Credits"
          subtitle={creditsUsd > 0 ? 'Apply at checkout' : 'No credits yet'}
          trailing={formatUsd(creditsUsd)}
          onPress={() => setStep('credits')}
        />
        <SectionRow
          icon="pricetag-outline"
          title="Promo Code"
          subtitle={summary?.promoCodeApplied ? `Applied: ${summary.promoCodeApplied}` : 'Add a promo code'}
          onPress={() => setStep('promo')}
        />
        <SectionRow
          icon="people-outline"
          title="Referral Credit"
          subtitle={referralUsd > 0 ? 'Eligible to apply' : 'Invite friends to earn'}
          trailing={formatUsd(referralUsd)}
          onPress={() => setStep('referral')}
        />
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
            <ActivityIndicator color={colors.gold} size="small" />
          </View>
        ) : null}
      </ScrollView>
      <View style={[t.footer, { paddingBottom: 0 }]}>
        <Pressable
          style={[t.primaryBtn, loading && !walletReady && t.primaryBtnDisabled]}
          onPress={walletReady ? onClose : finishWalletSetup}
          disabled={loading && !walletReady}
        >
          <LiveRoomText style={t.primaryBtnText}>
            {walletReady ? 'Done' : 'Finish Vault Wallet Setup'}
          </LiveRoomText>
        </Pressable>
        {!recoveryMode ? (
          <Pressable style={t.secondaryBtn} onPress={onClose}>
            <LiveRoomText style={t.secondaryBtnText}>Stay in room</LiveRoomText>
          </Pressable>
        ) : null}
      </View>
    </>
  );

  const renderShipping = () => (
    <>
      <SheetHeader title="Shipping Address" onBack={goMain} />
      <ScrollView contentContainerStyle={t.scrollContent} showsVerticalScrollIndicator={false}>
        <LiveRoomText style={t.hintText}>
          Required before bidding, buying, claiming spots, or making offers.
        </LiveRoomText>
        {loading && !defaultAddress ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
            <ActivityIndicator color={colors.gold} />
            <LiveRoomText style={[t.hintText, { marginTop: spacing.sm }]}>Loading your address…</LiveRoomText>
          </View>
        ) : defaultAddress ? (
          <View style={t.detailCard}>
            <LiveRoomText style={t.detailTitle}>{defaultAddress.fullName}</LiveRoomText>
            <LiveRoomText style={t.detailBody}>{formatAddressBlock(defaultAddress)}</LiveRoomText>
            {defaultAddress.isDefault ? (
              <View style={t.badge}>
                <LiveRoomText style={t.badgeText}>Default</LiveRoomText>
              </View>
            ) : null}
            <Pressable style={t.linkBtn} onPress={() => openAddressForm(defaultAddress, 'shipping')}>
              <LiveRoomText style={t.linkBtnText}>Edit address</LiveRoomText>
            </Pressable>
          </View>
        ) : (
          <LiveRoomText style={t.sectionSubWarn}>No shipping address on file yet.</LiveRoomText>
        )}
        <Pressable
          style={t.linkBtn}
          onPress={() =>
            addresses.length ? setStep('addresses') : openAddressForm(undefined, 'shipping')
          }
        >
          <LiveRoomText style={t.linkBtnText}>
            {addresses.length ? 'Manage all addresses' : '+ Add address'}
          </LiveRoomText>
        </Pressable>
      </ScrollView>
      <View style={t.footer}>
        <Pressable style={t.primaryBtn} onPress={goMain}>
          <LiveRoomText style={t.primaryBtnText}>Done</LiveRoomText>
        </Pressable>
      </View>
    </>
  );

  const renderAddresses = () => (
    <>
      <SheetHeader
        title="Addresses"
        onBack={() => setStep(defaultAddress ? 'shipping' : 'main')}
        rightSlot={
          <Pressable onPress={() => openAddressForm(undefined, 'addresses')} hitSlop={8}>
            <Ionicons name="add-circle-outline" size={24} color={colors.gold} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={t.scrollContent}>
        {addresses.map((addr) => (
          <View key={addr.id} style={t.detailCard}>
            <LiveRoomText style={t.detailTitle}>{addr.fullName}</LiveRoomText>
            <LiveRoomText style={t.detailBody}>{formatAddressBlock(addr)}</LiveRoomText>
            {addr.isDefault ? (
              <View style={t.badge}>
                <LiveRoomText style={t.badgeText}>Default</LiveRoomText>
              </View>
            ) : null}
            <View style={t.pmActions}>
              <Pressable onPress={() => openAddressForm(addr, 'addresses')}>
                <LiveRoomText style={t.pmActionTxt}>Edit</LiveRoomText>
              </Pressable>
              <Pressable onPress={() => handleRemoveAddress(addr)}>
                <LiveRoomText style={[t.pmActionTxt, { color: '#fca5a5' }]}>Remove</LiveRoomText>
              </Pressable>
            </View>
          </View>
        ))}
        <Pressable style={t.linkBtn} onPress={() => openAddressForm(undefined, 'addresses')}>
          <LiveRoomText style={t.linkBtnText}>+ Add new address</LiveRoomText>
        </Pressable>
      </ScrollView>
    </>
  );

  const walletCapabilities = summary?.capabilities;
  const stripePublishableKey = summary?.stripePublishableKey ?? null;
  const walletPlatform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

  const renderPaymentCatalogRow = (entry: (typeof WALLET_SAVABLE_METHOD_CATALOG)[number]) => {
    if (!shouldShowWalletCatalogEntry(entry, walletPlatform)) return null;
    const iconName =
      entry.id === 'apple_pay'
        ? 'logo-apple'
        : entry.id === 'google_pay'
          ? 'logo-google'
          : entry.id === 'cash_app_pay'
            ? 'cash-outline'
            : entry.id === 'link'
              ? 'link-outline'
              : entry.id === 'amazon_pay'
                ? 'logo-amazon'
                : 'card-outline';
    return (
      <View key={entry.id} style={t.detailCard}>
        <View style={t.pmRow}>
          <View style={t.pmIcon}>
            <Ionicons name={iconName} size={20} color={colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <LiveRoomText style={t.detailTitle}>{entry.label}</LiveRoomText>
            <LiveRoomText style={t.detailBody}>{walletMethodEligibilityLabel(entry)}</LiveRoomText>
          </View>
        </View>
      </View>
    );
  };

  const renderPayment = () => (
    <>
      <SheetHeader title="Payment Methods" onBack={goMain} />
      <ScrollView contentContainerStyle={t.scrollContent}>
        <LiveRoomText style={t.hintText}>
          Saved methods charge instantly for live wins and buy-it-now. Marketplace checkout may also offer
          payment plans when Stripe says you are eligible.
        </LiveRoomText>

        <LiveRoomText style={[t.sectionTitle, { marginTop: spacing.sm }]}>Payment Methods</LiveRoomText>
        {WALLET_SAVABLE_METHOD_CATALOG.map(renderPaymentCatalogRow)}

        <View style={[t.detailCard, { gap: spacing.sm, marginTop: spacing.sm }]}>
          <LiveRoomText style={t.detailTitle}>Add payment method</LiveRoomText>
          {stripePublishableKey ? (
            <WalletNativePayButton
              publishableKey={stripePublishableKey}
              onPress={openPaymentSetup}
              appearance="dark"
            />
          ) : null}
          <Pressable style={t.payOptionBtn} onPress={openPaymentSetup}>
            <Ionicons name="card-outline" size={20} color={colors.gold} />
            <LiveRoomText style={t.payOptionBtnText}>Credit / debit card & more</LiveRoomText>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.35)" />
          </Pressable>
          {walletCapabilities?.link || walletCapabilities?.cashAppPay || walletCapabilities?.amazonPay ? (
            <LiveRoomText style={t.hintText}>
              Link, Cash App Pay, and Amazon Pay appear in Stripe when you add a payment method.
            </LiveRoomText>
          ) : null}
        </View>

        <LiveRoomText style={[t.sectionTitle, { marginTop: spacing.md }]}>Marketplace Payment Plans</LiveRoomText>
        <LiveRoomText style={[t.hintText, { marginBottom: spacing.sm }]}>
          Available for Marketplace checkout only — not live auctions or trades.
        </LiveRoomText>
        {WALLET_MARKETPLACE_BNPL_CATALOG.map((entry) => (
          <View key={entry.id} style={t.detailCard}>
            <View style={t.pmRow}>
              <View style={t.pmIcon}>
                <Ionicons name="time-outline" size={20} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <LiveRoomText style={t.detailTitle}>{entry.label}</LiveRoomText>
                <LiveRoomText style={t.detailBody}>{walletMethodEligibilityLabel(entry)}</LiveRoomText>
              </View>
            </View>
          </View>
        ))}

        <LiveRoomText style={[t.sectionTitle, { marginTop: spacing.md }]}>Saved methods</LiveRoomText>
        {paymentMethods.length === 0 ? (
          <LiveRoomText style={t.sectionSubWarn}>Add a payment method to bid and buy.</LiveRoomText>
        ) : (
          paymentMethods.map((pm) => {
            const pmType = normalizePmType(pm.type);
            const catalogEntry =
              WALLET_SAVABLE_METHOD_CATALOG.find((e) => e.id === pmType) ??
              WALLET_SAVABLE_METHOD_CATALOG.find((e) => e.id === 'card');
            return (
              <View key={pm.id} style={t.detailCard}>
                <View style={t.pmRow}>
                  <View style={t.pmIcon}>
                    <Ionicons name={walletPmIcon(pmType)} size={20} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <LiveRoomText style={t.detailTitle}>{walletPmLabel(pm)}</LiveRoomText>
                    {pmType === 'card' && pm.last4 ? (
                      <LiveRoomText style={t.detailBody}>
                        ···· {pm.last4} · Exp {formatCardExp(pm.expMonth, pm.expYear)}
                      </LiveRoomText>
                    ) : (
                      <LiveRoomText style={t.detailBody}>Saved with Stripe</LiveRoomText>
                    )}
                    {catalogEntry ? (
                      <LiveRoomText style={[t.hintText, { marginTop: 4 }]}>
                        {walletMethodEligibilityLabel(catalogEntry)}
                      </LiveRoomText>
                    ) : null}
                  </View>
                  {pm.isDefault ? (
                    <View style={t.badge}>
                      <LiveRoomText style={t.badgeText}>Default</LiveRoomText>
                    </View>
                  ) : null}
                </View>
                <View style={t.pmActions}>
                  {!pm.isDefault ? (
                    <Pressable onPress={() => void handleSetDefaultPm(pm)}>
                      <LiveRoomText style={t.pmActionTxt}>Set default</LiveRoomText>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => handleRemovePm(pm)}>
                    <LiveRoomText style={[t.pmActionTxt, { color: '#fca5a5' }]}>Remove</LiveRoomText>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        <View style={[t.detailCard, { marginTop: spacing.md }]}>
          <LiveRoomText style={t.detailTitle}>Payout method</LiveRoomText>
          <LiveRoomText style={t.detailBody}>
            Seller payouts use Stripe Connect bank accounts — separate from buyer payment methods. Manage
            payouts in Seller Hub.
          </LiveRoomText>
        </View>
      </ScrollView>
      <View style={t.footer}>
        {recoveryMode ? (
          <Pressable style={t.primaryBtn} onPress={() => onPaymentMethodSaved?.()}>
            <LiveRoomText style={t.primaryBtnText}>Retry payment</LiveRoomText>
          </Pressable>
        ) : null}
        <Pressable style={recoveryMode ? t.secondaryBtn : t.primaryBtn} onPress={goMain}>
          <LiveRoomText style={recoveryMode ? t.secondaryBtnText : t.primaryBtnText}>Done</LiveRoomText>
        </Pressable>
      </View>
    </>
  );

  const renderAddressForm = () => (
    <>
      <SheetHeader
        title={addressFormEditing ? 'Edit Address' : 'Add Address'}
        onBack={() => setStep(addressFormReturnStep.current)}
      />
      <ScrollView contentContainerStyle={t.scrollContent} keyboardShouldPersistTaps="handled">
        <LiveRoomText style={t.hintText}>Used for live wins, PYT/PYD spots, and vault deliveries.</LiveRoomText>
        {(
          [
            ['Label', 'name', 'Shipping'],
            ['Full name', 'fullName', 'Jane Collector'],
            ['Address line 1', 'line1', '123 Main St'],
            ['Address line 2 (optional)', 'line2', 'Apt 4'],
            ['City', 'city', 'City'],
            ['State / region', 'state', 'CA'],
            ['Postal code', 'postalCode', '90210'],
            ['Country (ISO)', 'country', 'US'],
          ] as const
        ).map(([label, key, placeholder]) => (
          <View key={key} style={{ gap: 4 }}>
            <LiveRoomText style={t.fieldLabel}>{label}</LiveRoomText>
            <TextInput
              value={key === 'line2' ? addressFormDraft.line2 ?? '' : String(addressFormDraft[key] ?? '')}
              onChangeText={(text) =>
                setAddressFormDraft((prev) => ({
                  ...prev,
                  [key]:
                    key === 'line2'
                      ? text
                      : key === 'country'
                        ? text.toUpperCase().slice(0, 2)
                        : text,
                }))
              }
              placeholder={placeholder}
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={t.formInput}
              autoCapitalize={key === 'country' ? 'characters' : 'words'}
              keyboardType={key === 'postalCode' ? 'number-pad' : 'default'}
            />
          </View>
        ))}
        <View style={t.switchRow}>
          <LiveRoomText style={t.switchLabel}>Default shipping address</LiveRoomText>
          <Switch
            value={addressFormDraft.isDefault !== false}
            onValueChange={(v) => setAddressFormDraft((prev) => ({ ...prev, isDefault: v }))}
            trackColor={{ true: colors.gold }}
          />
        </View>
      </ScrollView>
      <View style={t.footer}>
        <Pressable
          style={[t.primaryBtn, addressFormBusy && t.primaryBtnDisabled]}
          onPress={() => void saveAddressForm()}
          disabled={addressFormBusy}
        >
          {addressFormBusy ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <LiveRoomText style={t.primaryBtnText}>Save address</LiveRoomText>
          )}
        </Pressable>
      </View>
    </>
  );

  const renderCredits = () => (
    <>
      <SheetHeader title="Vault Credits" onBack={goMain} />
      <ScrollView contentContainerStyle={t.scrollContent}>
        <View style={t.detailCard}>
          <LiveRoomText style={t.detailTitle}>Available balance</LiveRoomText>
          <LiveRoomText style={[t.sectionAmount, { fontSize: 28, marginTop: 4 }]}>{formatUsd(creditsUsd)}</LiveRoomText>
          <LiveRoomText style={t.detailBody}>
            Eligible credits apply automatically at checkout for marketplace and live purchases.
          </LiveRoomText>
        </View>
      </ScrollView>
    </>
  );

  const renderPromo = () => (
    <>
      <SheetHeader title="Promo Code" onBack={goMain} />
      <ScrollView contentContainerStyle={t.scrollContent} keyboardShouldPersistTaps="handled">
        <TextInput
          style={t.promoInput}
          placeholder="Enter promo code"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={promoDraft}
          onChangeText={setPromoDraft}
          autoCapitalize="characters"
        />
        <LiveRoomText style={t.hintText}>
          Promo validation at checkout is coming soon. Codes will apply to eligible orders in Vault Wallet.
        </LiveRoomText>
        <Pressable
          style={[t.primaryBtn, !promoDraft.trim() && t.primaryBtnDisabled]}
          disabled={!promoDraft.trim()}
          onPress={() => Alert.alert('Coming soon', 'Promo codes will validate at checkout in an upcoming release.')}
        >
          <LiveRoomText style={t.primaryBtnText}>Apply code</LiveRoomText>
        </Pressable>
      </ScrollView>
    </>
  );

  const renderReferral = () => (
    <>
      <SheetHeader title="Referral Credit" onBack={goMain} />
      <ScrollView contentContainerStyle={t.scrollContent}>
        <View style={t.detailCard}>
          <LiveRoomText style={t.detailTitle}>Available referral credit</LiveRoomText>
          <LiveRoomText style={[t.sectionAmount, { fontSize: 28, marginTop: 4 }]}>{formatUsd(referralUsd)}</LiveRoomText>
          <LiveRoomText style={t.detailBody}>
            Refer friends to Get Vaulted. Credit applies to eligible purchases when your referral program is active.
          </LiveRoomText>
        </View>
      </ScrollView>
    </>
  );

  const renderStep = () => {
    switch (step) {
      case 'shipping':
        return renderShipping();
      case 'addresses':
        return renderAddresses();
      case 'addressForm':
        return renderAddressForm();
      case 'payment':
        return renderPayment();
      case 'credits':
        return renderCredits();
      case 'promo':
        return renderPromo();
      case 'referral':
        return renderReferral();
      default:
        return renderMain();
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={
          recoveryMode
            ? () => {}
            : step === 'main'
              ? onClose
              : () => setStep(step === 'addressForm' ? addressFormReturnStep.current : 'main')
        }
        statusBarTranslucent
      >
        <View style={t.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={recoveryMode ? undefined : step === 'main' ? onClose : undefined}
            accessibilityLabel="Dismiss Vault Wallet"
          />
          <KeyboardAvoidingView
            style={{ maxHeight: sheetMaxHeight, width: '100%' }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={[t.sheet, { paddingBottom: safeBottom }]}>
              <View style={t.handle} />
              {renderStep()}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <WalletPaymentSetupModal
        visible={visible && paymentSetupOpen}
        accessToken={accessToken}
        onClose={() => {
          if (recoveryMode) {
            onClose();
            return;
          }
          setPaymentSetupOpen(false);
        }}
        onSaved={(paymentMethodId) => {
          void loadWalletData();
          setPaymentSetupOpen(false);
          setStep('payment');
          onPaymentMethodSaved?.(paymentMethodId);
        }}
      />
    </>
  );
}

/** Primary export — Vault Wallet sheet used across live, checkout, and account. */
export const WalletSheet = VaultWalletSheet;
export const WalletRequirementSheet = VaultWalletSheet;
