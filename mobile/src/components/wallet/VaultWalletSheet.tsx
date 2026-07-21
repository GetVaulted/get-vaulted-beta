import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
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
import { AddressAutocompleteFields } from '../address/AddressAutocompleteFields';
import { logWalletSheet, useKeyboardInset } from './walletSheetKeyboard';
import { WalletPaymentSetupPanel } from './WalletPaymentSetupStep';
import { vaultWalletTheme as t } from './vaultWalletTheme';
import {
  formatAddressBlock,
  formatAddressOneLine,
  formatCardExp,
  formatShipToLine,
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
import { referralJoinUrl } from '../../lib/referralLink';
import {
  LIVE_PREMIUM_WALLET_TITLE,
  catalogEntryIcon,
  liveAcceptedMethodsLabel,
  liveAcceptedWalletMethods,
} from '../../lib/livePremiumWallet';

const referralStyles = StyleSheet.create({
  linkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    backgroundColor: 'rgba(212,175,55,0.08)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  linkText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.gold },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.gold,
    paddingVertical: spacing.sm + 2,
  },
  shareBtnText: { fontSize: 14, fontWeight: '800', color: '#0a0908' },
});

export type WalletStep =
  | 'main'
  | 'shipping'
  | 'addresses'
  | 'addressForm'
  | 'payment'
  | 'credits'
  | 'promo'
  | 'referral'
  | 'premium';

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
  /** Recovery — jump straight into Shippo address form (edit default or add new). */
  openAddressFormOnMount?: boolean;
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
  phone: '',
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
  liveStyle,
  accentIcon,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  trailing?: string;
  missing?: boolean;
  onPress: () => void;
  liveStyle?: boolean;
  accentIcon?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [t.sectionCard, liveStyle && t.sectionCardLive, pressed && t.sectionCardPressed]}
      onPress={onPress}
    >
      <View style={[t.sectionIcon, liveStyle && t.sectionIconLive, accentIcon && t.sectionIconAccent]}>
        <Ionicons name={icon} size={20} color={accentIcon ? '#0a0908' : liveStyle ? '#fff' : colors.gold} />
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
  openAddressFormOnMount = false,
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
  const [paymentSetupStartWith, setPaymentSetupStartWith] = useState<'picker' | 'card' | 'wallet'>(
    'picker',
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
  const [referralLinkCopied, setReferralLinkCopied] = useState(false);
  const openSeedAppliedRef = useRef(false);
  const addressFormSeedAppliedRef = useRef(false);
  const loadInFlight = useRef(false);
  const wasVisibleRef = useRef(false);
  const addressFormReturnStep = useRef<WalletStep>('shipping');
  const addressFormScrollRef = useRef<ScrollView | null>(null);

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
      setPaymentSetupStartWith('picker');
      setEditingAddressId(null);
      setActionError(null);
      openSeedAppliedRef.current = false;
      addressFormSeedAppliedRef.current = false;
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

  useEffect(() => {
    if (!visible || !openAddressFormOnMount || addressFormSeedAppliedRef.current || loading) return;
    if (step !== 'shipping') return;
    addressFormSeedAppliedRef.current = true;
    const seed = pickDefaultShippingAddress(addresses);
    addressFormReturnStep.current = 'shipping';
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
        phone: seed.phone ?? '',
        isDefault: seed.isDefault !== false,
      });
      setAddressFormEditing(true);
    } else {
      setEditingAddressId(null);
      setAddressFormDraft(EMPTY_ADDRESS);
      setAddressFormEditing(false);
    }
    setStep('addressForm');
  }, [visible, openAddressFormOnMount, loading, step, addresses]);

  const goMain = () => setStep('main');
  const openPaymentSetup = (mode: 'picker' | 'card' | 'wallet' = 'picker') => {
    setPaymentSetupStartWith(mode);
    setPaymentSetupOpen(true);
  };

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
        phone: seed.phone ?? '',
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
      if (recoveryMode) {
        onPaymentMethodSaved?.();
      }
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
  const referralPendingUsd = summary?.referralCreditPendingUsd ?? 0;
  const referralCode = summary?.referralCode ?? '';
  const referralCount = summary?.referralSuccessfulReferrals ?? 0;
  const referralUrl = referralCode ? referralJoinUrl(referralCode) : '';
  const walletCapabilities = summary?.capabilities;
  const stripePublishableKey = summary?.stripePublishableKey?.trim() || null;
  const walletPlatform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  const liveMethods = liveAcceptedWalletMethods(walletPlatform, walletCapabilities);

  const renderMain = () => (
    <>
      {!recoveryMode ? (
        <Pressable style={t.liveCloseBtn} onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color="rgba(255,255,255,0.65)" />
        </Pressable>
      ) : null}
      <LiveRoomText style={t.liveSheetTitle}>{LIVE_PREMIUM_WALLET_TITLE}</LiveRoomText>
      <View style={[t.readinessPill, walletReady ? t.readinessReady : t.readinessSetup, { alignSelf: 'center', marginBottom: spacing.sm }]}>
        <Ionicons
          name={walletReady ? 'checkmark-circle' : 'alert-circle-outline'}
          size={14}
          color={walletReady ? '#6ee7b7' : colors.gold}
        />
        <LiveRoomText style={[t.readinessTxt, walletReady ? t.readinessTxtReady : t.readinessTxtSetup]}>
          {walletReady ? 'Ready to bid & buy live' : 'Complete setup to bid & buy'}
        </LiveRoomText>
      </View>
      {actionError ? <LiveRoomText style={t.errorText}>{actionError}</LiveRoomText> : null}
      <ScrollView
        contentContainerStyle={t.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SectionRow
          icon="car-outline"
          title="Shipping"
          subtitle={formatShipToLine(defaultAddress)}
          missing={!shippingReady}
          liveStyle
          onPress={() => setStep('shipping')}
        />
        <SectionRow
          icon="card-outline"
          title="Payment"
          subtitle={
            primaryPayment
              ? walletPmSummary(primaryPayment)
              : liveAcceptedMethodsLabel(walletPlatform, walletCapabilities)
          }
          missing={!paymentReady}
          liveStyle
          onPress={() => setStep('payment')}
        />
        <SectionRow
          icon="gift-outline"
          title="Vault credits"
          subtitle={
            creditsUsd > 0
              ? `${formatUsd(creditsUsd)} in Vault credits · buyer protection`
              : 'Buyer protection, credits & show perks'
          }
          trailing={referralUsd > 0 ? formatUsd(referralUsd) : undefined}
          liveStyle
          accentIcon
          onPress={() => setStep('premium')}
        />
        <View style={t.promoRow}>
          <TextInput
            style={[t.promoInput, { flex: 1, marginBottom: 0 }]}
            placeholder="Promo Code"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={promoDraft}
            onChangeText={setPromoDraft}
            autoCapitalize="characters"
            editable={false}
          />
          <Pressable style={[t.promoApplyBtn, t.promoApplyBtnDisabled]} disabled>
            <LiveRoomText style={t.promoApplyText}>Apply</LiveRoomText>
          </Pressable>
        </View>
        <LiveRoomText style={[t.hintText, { marginTop: spacing.sm }]}>
          Promo codes apply at checkout. In-wallet validation is coming soon.
        </LiveRoomText>
        <LiveRoomText style={[t.hintText, { marginTop: spacing.xs }]}>
          Live accepts {liveAcceptedMethodsLabel(walletPlatform, walletCapabilities)}.
        </LiveRoomText>
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
            <ActivityIndicator color={colors.gold} size="small" />
          </View>
        ) : null}
      </ScrollView>
      <View style={[t.footer, { paddingBottom: 0 }]}>
        {recoveryMode ? (
          <Pressable style={t.primaryBtn} onPress={() => onPaymentMethodSaved?.()}>
            <LiveRoomText style={t.primaryBtnText}>Retry payment</LiveRoomText>
          </Pressable>
        ) : null}
        <Pressable
          style={[
            recoveryMode ? t.secondaryBtn : t.primaryBtn,
            !recoveryMode && loading && !walletReady && t.primaryBtnDisabled,
          ]}
          onPress={recoveryMode ? onClose : walletReady ? onClose : finishWalletSetup}
          disabled={!recoveryMode && loading && !walletReady}
        >
          <LiveRoomText style={recoveryMode ? t.secondaryBtnText : t.primaryBtnText}>
            {recoveryMode ? 'Back' : walletReady ? 'Done' : 'Finish setup'}
          </LiveRoomText>
        </Pressable>
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

  const renderPayment = () => (
    <>
      <SheetHeader title="Payment" onBack={goMain} />
      <ScrollView contentContainerStyle={t.scrollContent} showsVerticalScrollIndicator={false}>
        {Platform.OS === 'ios' || Platform.OS === 'android' ? (
          <WalletNativePayButton
            publishableKey={stripePublishableKey}
            onPress={() => openPaymentSetup('wallet')}
            appearance="dark"
          />
        ) : null}

        <View style={t.orDividerRow}>
          <View style={t.orDividerLine} />
          <LiveRoomText style={t.orDividerText}>Or use</LiveRoomText>
          <View style={t.orDividerLine} />
        </View>

        <LiveRoomText style={t.liveSectionLabel}>Saved</LiveRoomText>
        {paymentMethods.length === 0 ? (
          <LiveRoomText style={t.sectionSubWarn}>No saved payment method yet.</LiveRoomText>
        ) : (
          paymentMethods.map((pm) => {
            const pmType = normalizePmType(pm.type);
            return (
              <Pressable
                key={pm.id}
                style={[t.savedPmCard, (pm.isDefault || pm.id === primaryPayment?.id) && t.savedPmCardSelected]}
                onPress={() => void handleSetDefaultPm(pm)}
              >
                <View style={t.pmIcon}>
                  <Ionicons name={walletPmIcon(pmType)} size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <LiveRoomText style={t.detailTitle}>{walletPmLabel(pm)}</LiveRoomText>
                  {pmType === 'card' && pm.last4 ? (
                    <LiveRoomText style={t.detailBody}>
                      ···· {pm.last4} · Exp {formatCardExp(pm.expMonth, pm.expYear)}
                    </LiveRoomText>
                  ) : (
                    <LiveRoomText style={t.detailBody}>Saved for live checkout</LiveRoomText>
                  )}
                </View>
                {pm.isDefault ? (
                  <LiveRoomText style={[t.pmActionTxt, { color: '#93c5fd' }]}>Default</LiveRoomText>
                ) : (
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.35)" />
                )}
              </Pressable>
            );
          })
        )}

        <LiveRoomText style={t.liveSectionLabel}>New payment method</LiveRoomText>
        <Pressable style={t.newCardBtn} onPress={() => openPaymentSetup('card')}>
          <Ionicons name="card-outline" size={18} color="#f4f2ec" />
          <LiveRoomText style={t.newCardBtnText}>New card</LiveRoomText>
        </Pressable>

        <LiveRoomText style={t.liveSectionLabel}>Accepted on live</LiveRoomText>
        <View style={t.detailCard}>
          {liveMethods.map((entry, idx) => (
            <View
              key={entry.id}
              style={[t.liveMethodRow, idx === liveMethods.length - 1 && t.liveMethodRowLast]}
            >
              <View style={t.pmIcon}>
                <Ionicons name={catalogEntryIcon(entry.id)} size={18} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <LiveRoomText style={t.detailTitle}>{entry.label}</LiveRoomText>
                <LiveRoomText style={t.detailBody}>Instant checkout for bids & buy-now</LiveRoomText>
              </View>
            </View>
          ))}
        </View>
        <LiveRoomText style={t.hintText}>
          Affirm, Klarna, and Afterpay are marketplace-only — not available during live shows.
        </LiveRoomText>
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

  const renderPremium = () => (
    <>
      <SheetHeader title="Vault credits" onBack={goMain} />
      <ScrollView contentContainerStyle={t.scrollContent}>
        <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
          <View style={t.premiumHeroIcon}>
            <Ionicons name="shield-checkmark" size={28} color="#0a0908" />
          </View>
          <LiveRoomText style={[t.heroTitle, { fontSize: 20 }]}>Vault credits</LiveRoomText>
          <LiveRoomText style={t.heroSub}>
            Secure checkout for live bids, PYT spots, and instant buy-now — backed by Stripe.
          </LiveRoomText>
        </View>
        <View style={t.detailCard}>
          <LiveRoomText style={t.detailTitle}>Vault credits</LiveRoomText>
          <LiveRoomText style={[t.sectionAmount, { fontSize: 24, marginTop: 4 }]}>{formatUsd(creditsUsd)}</LiveRoomText>
          <LiveRoomText style={t.detailBody}>Applied automatically on eligible live & marketplace purchases.</LiveRoomText>
        </View>
        <Pressable style={t.detailCard} onPress={() => setStep('referral')}>
          <LiveRoomText style={t.detailTitle}>Referral credit</LiveRoomText>
          <LiveRoomText style={[t.sectionAmount, { fontSize: 24, marginTop: 4 }]}>{formatUsd(referralUsd)}</LiveRoomText>
          <LiveRoomText style={t.detailBody}>Invite friends — you both get $10 after their first order. Tap to get your link.</LiveRoomText>
        </Pressable>
        <View style={t.detailCard}>
          <LiveRoomText style={t.detailTitle}>Live payment methods</LiveRoomText>
          {liveMethods.map((entry) => (
            <LiveRoomText key={entry.id} style={[t.detailBody, { marginTop: 4 }]}>
              · {entry.label}
            </LiveRoomText>
          ))}
        </View>
      </ScrollView>
      <View style={t.footer}>
        <Pressable style={t.primaryBtn} onPress={goMain}>
          <LiveRoomText style={t.primaryBtnText}>Done</LiveRoomText>
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
      <ScrollView ref={addressFormScrollRef} contentContainerStyle={t.scrollContent} keyboardShouldPersistTaps="handled">
        <LiveRoomText style={t.hintText}>Used for live wins, PYT/PYD spots, and vault deliveries.</LiveRoomText>
        <View style={{ gap: 4 }}>
          <LiveRoomText style={t.fieldLabel}>Label</LiveRoomText>
          <TextInput
            value={addressFormDraft.name}
            onChangeText={(text) => setAddressFormDraft((prev) => ({ ...prev, name: text }))}
            placeholder="Shipping"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={t.formInput}
          />
        </View>
        <View style={{ gap: 4 }}>
          <LiveRoomText style={t.fieldLabel}>Full name</LiveRoomText>
          <TextInput
            value={addressFormDraft.fullName}
            onChangeText={(text) => setAddressFormDraft((prev) => ({ ...prev, fullName: text }))}
            placeholder="Jane Collector"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={t.formInput}
          />
        </View>
        <View style={{ gap: 4 }}>
          <LiveRoomText style={t.fieldLabel}>Contact phone (required for USPS labels)</LiveRoomText>
          <TextInput
            value={addressFormDraft.phone}
            onChangeText={(text) => setAddressFormDraft((prev) => ({ ...prev, phone: text }))}
            placeholder="(555) 123-4567"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={t.formInput}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
        </View>
        <AddressAutocompleteFields
          accessToken={accessToken}
          scrollViewRef={addressFormScrollRef}
          values={{
            line1: addressFormDraft.line1,
            line2: addressFormDraft.line2 ?? '',
            city: addressFormDraft.city,
            state: addressFormDraft.state,
            postalCode: addressFormDraft.postalCode,
            country: addressFormDraft.country,
          }}
          onChange={(field, value) =>
            setAddressFormDraft((prev) => ({
              ...prev,
              [field]:
                field === 'country'
                  ? value.toUpperCase().slice(0, 2)
                  : field === 'line2'
                    ? value
                    : value,
            }))
          }
          inputStyle={t.formInput}
          labelStyle={t.fieldLabel}
        />
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
            <LiveRoomText style={t.primaryBtnText}>
              {recoveryMode ? 'Save & retry payment' : 'Save address'}
            </LiveRoomText>
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
          editable={false}
        />
        <LiveRoomText style={t.hintText}>
          Promo codes apply at checkout on eligible orders. Enter your code during checkout — in-wallet validation is coming soon.
        </LiveRoomText>
        <Pressable style={[t.primaryBtn, t.primaryBtnDisabled]} disabled>
          <LiveRoomText style={t.primaryBtnText}>Apply at checkout</LiveRoomText>
        </Pressable>
      </ScrollView>
    </>
  );

  const copyReferralLink = async () => {
    if (!referralUrl) return;
    try {
      await Clipboard.setStringAsync(referralUrl);
      setReferralLinkCopied(true);
      setTimeout(() => setReferralLinkCopied(false), 2000);
    } catch {
      Alert.alert('Could not copy link', 'Try again in a moment.');
    }
  };

  const shareReferralLink = async () => {
    if (!referralUrl) return;
    try {
      await Share.share({
        message: `Join me on Get Vaulted — download the app, then sign up with my invite code ${referralCode} (or open my link). We'll both get $10 in credit after your first order.\n${referralUrl}`,
      });
    } catch {
      /* dismissed */
    }
  };

  const renderReferral = () => (
    <>
      <SheetHeader title="Referral Credit" onBack={goMain} />
      <ScrollView contentContainerStyle={t.scrollContent}>
        <View style={t.detailCard}>
          <LiveRoomText style={t.detailTitle}>Available referral credit</LiveRoomText>
          <LiveRoomText style={[t.sectionAmount, { fontSize: 28, marginTop: 4 }]}>{formatUsd(referralUsd)}</LiveRoomText>
          <LiveRoomText style={t.detailBody}>
            Applied when you choose it at checkout — Buy Now, offers, and auction pay.
          </LiveRoomText>
          {referralPendingUsd > 0 ? (
            <LiveRoomText style={[t.detailBody, { marginTop: 6 }]}>
              +{formatUsd(referralPendingUsd)} pending — clears once the qualifying order's return window closes.
            </LiveRoomText>
          ) : null}
        </View>
        <View style={t.detailCard}>
          <LiveRoomText style={t.detailTitle}>Your referral link</LiveRoomText>
          <LiveRoomText style={[t.detailBody, { marginTop: 4 }]}>
            You and your friend each get $10 credit after their first order of $25 or more.
          </LiveRoomText>
          {referralUrl ? (
            <>
              <Pressable style={referralStyles.linkBox} onPress={() => void copyReferralLink()}>
                <LiveRoomText style={referralStyles.linkText} numberOfLines={1}>
                  {referralUrl.replace(/^https?:\/\//, '')}
                </LiveRoomText>
                <Ionicons name={referralLinkCopied ? 'checkmark' : 'copy-outline'} size={16} color={colors.gold} />
              </Pressable>
              <Pressable style={referralStyles.shareBtn} onPress={() => void shareReferralLink()}>
                <Ionicons name="share-outline" size={16} color="#0a0908" />
                <LiveRoomText style={referralStyles.shareBtnText}>Share your link</LiveRoomText>
              </Pressable>
              <LiveRoomText style={[t.detailBody, { marginTop: spacing.sm }]}>
                {referralCount > 0
                  ? `${referralCount} friend${referralCount === 1 ? '' : 's'} referred so far.`
                  : 'No referrals yet — share your link to get started.'}
              </LiveRoomText>
            </>
          ) : null}
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
      case 'premium':
        return renderPremium();
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
            : paymentSetupOpen
              ? () => {
                  setPaymentSetupOpen(false);
                  setPaymentSetupStartWith('picker');
                }
              : step === 'main'
                ? onClose
                : () => setStep(step === 'addressForm' ? addressFormReturnStep.current : 'main')
        }
        statusBarTranslucent
      >
        {paymentSetupOpen ? (
          <View style={[t.sheet, { flex: 1, paddingBottom: safeBottom, maxHeight: sheetMaxHeight }]}>
            <WalletPaymentSetupPanel
              active={paymentSetupOpen}
              accessToken={accessToken}
              startWith={paymentSetupStartWith}
              onClose={() => {
                if (recoveryMode) {
                  onClose();
                  return;
                }
                setPaymentSetupOpen(false);
                setPaymentSetupStartWith('picker');
              }}
              onSaved={(paymentMethodId) => {
                void loadWalletData();
                setPaymentSetupOpen(false);
                setPaymentSetupStartWith('picker');
                setStep('payment');
                onPaymentMethodSaved?.(paymentMethodId);
              }}
            />
          </View>
        ) : (
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
        )}
      </Modal>
    </>
  );
}

/** Primary export — Vault Wallet sheet used across live, checkout, and account. */
export const WalletSheet = VaultWalletSheet;
export const WalletRequirementSheet = VaultWalletSheet;
