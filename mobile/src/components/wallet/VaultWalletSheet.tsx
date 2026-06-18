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
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deleteBuyerPaymentMethod,
  deleteBuyerShippingAddress,
  fetchBuyerShippingAddresses,
  fetchBuyerWalletReadiness,
  fetchBuyerWalletSummary,
  setBuyerDefaultPaymentMethod,
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
import { WalletAddressSetupModal } from './WalletAddressSetupModal';
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

export type WalletStep =
  | 'main'
  | 'shipping'
  | 'addresses'
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
  const [addressSetupOpen, setAddressSetupOpen] = useState(false);
  const [addressModalDraft, setAddressModalDraft] = useState<CreateShippingAddressInput | null>(null);
  const [addressModalEditing, setAddressModalEditing] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [readiness, setReadiness] = useState<BuyerWalletReadiness | null>(initialReadiness ?? null);
  const [summary, setSummary] = useState<BuyerWalletSummary | null>(null);
  const [addresses, setAddresses] = useState<BuyerShippingAddressRow[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [promoDraft, setPromoDraft] = useState('');
  const openSeedAppliedRef = useRef(false);
  const loadInFlight = useRef(false);

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
      setStep('main');
      setPaymentSetupOpen(false);
      setAddressSetupOpen(false);
      setAddressModalDraft(null);
      setEditingAddressId(null);
      setActionError(null);
      openSeedAppliedRef.current = false;
      return;
    }
    if (initialReadiness && !openSeedAppliedRef.current) {
      setReadiness(initialReadiness);
      openSeedAppliedRef.current = true;
    }
    setStep(recoveryMode ? initialStep : 'main');
    if (recoveryMode && openPaymentSetupOnMount) setPaymentSetupOpen(true);
    void loadRef.current();
  }, [visible, recoveryMode, initialStep, openPaymentSetupOnMount, initialReadiness]);

  const goMain = () => setStep('main');
  const openPaymentSetup = () => setPaymentSetupOpen(true);

  const openAddAddress = (seed?: BuyerShippingAddressRow) => {
    if (seed) {
      setEditingAddressId(seed.id);
      setAddressModalDraft({
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
      setAddressModalEditing(true);
    } else {
      setEditingAddressId(null);
      setAddressModalDraft(EMPTY_ADDRESS);
      setAddressModalEditing(false);
    }
    setAddressSetupOpen(true);
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
    if (!shippingReady) {
      if (addresses.length === 0) openAddAddress();
      else setStep('shipping');
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
          style={[t.primaryBtn, loading && t.primaryBtnDisabled]}
          onPress={walletReady ? onClose : finishWalletSetup}
          disabled={loading}
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
        {defaultAddress ? (
          <View style={t.detailCard}>
            <LiveRoomText style={t.detailTitle}>{defaultAddress.fullName}</LiveRoomText>
            <LiveRoomText style={t.detailBody}>{formatAddressBlock(defaultAddress)}</LiveRoomText>
            {defaultAddress.isDefault ? (
              <View style={t.badge}>
                <LiveRoomText style={t.badgeText}>Default</LiveRoomText>
              </View>
            ) : null}
            <Pressable style={t.linkBtn} onPress={() => openAddAddress(defaultAddress)}>
              <LiveRoomText style={t.linkBtnText}>Edit address</LiveRoomText>
            </Pressable>
          </View>
        ) : (
          <LiveRoomText style={t.sectionSubWarn}>Add a shipping address to continue.</LiveRoomText>
        )}
        <Pressable style={t.linkBtn} onPress={() => (addresses.length ? setStep('addresses') : openAddAddress())}>
          <LiveRoomText style={t.linkBtnText}>
            {addresses.length ? 'Manage all addresses' : '+ Add address'}
          </LiveRoomText>
        </Pressable>
      </ScrollView>
      <View style={t.footer}>
        <Pressable style={t.primaryBtn} onPress={goMain}>
          <LiveRoomText style={t.primaryBtnText}>Save</LiveRoomText>
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
          <Pressable onPress={() => openAddAddress()} hitSlop={8}>
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
              <Pressable onPress={() => openAddAddress(addr)}>
                <LiveRoomText style={t.pmActionTxt}>Edit</LiveRoomText>
              </Pressable>
              <Pressable onPress={() => handleRemoveAddress(addr)}>
                <LiveRoomText style={[t.pmActionTxt, { color: '#fca5a5' }]}>Remove</LiveRoomText>
              </Pressable>
            </View>
          </View>
        ))}
        <Pressable style={t.linkBtn} onPress={() => openAddAddress()}>
          <LiveRoomText style={t.linkBtnText}>+ Add new address</LiveRoomText>
        </Pressable>
      </ScrollView>
    </>
  );

  const renderPayment = () => (
    <>
      <SheetHeader title="Payment Methods" onBack={goMain} />
      <ScrollView contentContainerStyle={t.scrollContent}>
        <LiveRoomText style={t.hintText}>
          Cards, Apple Pay, Google Pay, Link, Cash App Pay, and PayPal run through Stripe. Venmo arrives in a future update.
        </LiveRoomText>
        {paymentMethods.length === 0 ? (
          <LiveRoomText style={t.sectionSubWarn}>Add a payment method to bid and buy.</LiveRoomText>
        ) : (
          paymentMethods.map((pm) => {
            const pmType = normalizePmType(pm.type);
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
        <Pressable style={t.sectionCard} onPress={openPaymentSetup}>
          <View style={t.sectionIcon}>
            <Ionicons name="add" size={20} color={colors.gold} />
          </View>
          <LiveRoomText style={t.sectionTitle}>Add payment method</LiveRoomText>
          <Ionicons name="chevron-forward" size={18} color="#fff" style={t.chevron} />
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
        visible={visible && !paymentSetupOpen && !addressSetupOpen}
        animationType="slide"
        transparent
        onRequestClose={recoveryMode ? () => {} : step === 'main' ? onClose : () => setStep('main')}
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
      <WalletAddressSetupModal
        visible={visible && addressSetupOpen}
        accessToken={accessToken}
        editing={addressModalEditing}
        addressId={editingAddressId ?? undefined}
        initialDraft={addressModalDraft ?? undefined}
        onClose={() => setAddressSetupOpen(false)}
        onSaved={() => {
          void loadWalletData();
          setAddressSetupOpen(false);
          setStep(addressModalEditing ? 'addresses' : 'shipping');
        }}
      />
    </>
  );
}

/** Primary export — Vault Wallet sheet used across live, checkout, and account. */
export const WalletSheet = VaultWalletSheet;
export const WalletRequirementSheet = VaultWalletSheet;
