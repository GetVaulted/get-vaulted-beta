import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchBuyerPaymentMethods,
  fetchBuyerShippingAddresses,
  fetchBuyerWalletReadiness,
  type BuyerPaymentMethodRow,
  type BuyerShippingAddressRow,
  type CreateShippingAddressInput,
} from '../../api/buyerWalletRepository';
import type { BuyerWalletReadiness } from '../../lib/buyerWalletErrors';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from '../live/LiveRoomText';
import { walletSheetStyles as s } from './walletSheetStyles';
import {
  formatAddressBlock,
  formatAddressOneLine,
  formatCardExp,
  formatPaymentSummary,
  pickDefaultShippingAddress,
  pickPrimaryPaymentMethod,
} from './walletSheetUtils';
import { logWalletSheet, useKeyboardInset } from './walletSheetKeyboard';
import { WalletPaymentSetupModal } from './WalletPaymentSetupStep';
import { WalletAddressSetupModal } from './WalletAddressSetupModal';

export type WalletStep = 'main' | 'delivery' | 'addresses' | 'payment';

type Props = {
  visible: boolean;
  onClose: () => void;
  accessToken?: string;
  roomId: string;
  initialReadiness?: BuyerWalletReadiness | null;
  onReadinessChange?: (readiness: BuyerWalletReadiness) => void;
  onActiveChange?: (active: boolean) => void;
  /** Payment recovery from live room blocker — opens payment flow. */
  recoveryMode?: boolean;
  initialStep?: WalletStep;
  /** When true with recoveryMode, open add-card flow immediately. */
  openPaymentSetupOnMount?: boolean;
  /** Fired after a card is saved — parent can retry authorization with the freshly saved pm_. */
  onPaymentMethodSaved?: (paymentMethodId?: string) => void;
};

type AddressDraft = CreateShippingAddressInput;

const EMPTY_ADDRESS: AddressDraft = {
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
    <View style={s.headerRow}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={s.headerSpacer}>
          <Ionicons name="chevron-back" size={24} color={colors.gold} />
        </Pressable>
      ) : (
        <View style={s.headerSpacer} />
      )}
      <LiveRoomText style={s.headerTitle}>{title}</LiveRoomText>
      {rightSlot ?? <View style={s.headerSpacer} />}
    </View>
  );
}

function NavRow({
  icon,
  title,
  subtitle,
  missing,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  missing?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.navRow, pressed && s.navRowPressed]}
      onPress={onPress}
    >
      <View style={s.navIconWrap}>
        <Ionicons name={icon} size={20} color={colors.gold} />
      </View>
      <View style={s.navTextBlock}>
        <LiveRoomText style={s.navRowTitle}>{title}</LiveRoomText>
        <LiveRoomText style={missing ? s.navRowSubMissing : s.navRowSub} numberOfLines={2}>
          {subtitle}
        </LiveRoomText>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#fff" style={s.chevron} />
    </Pressable>
  );
}

export function WalletSheet({
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
  const keyboardInset = useKeyboardInset();
  const sheetMaxHeight = Math.min(windowHeight * 0.9, 680);
  const safeBottom = Math.max(insets.bottom, spacing.lg);
  const openSeedAppliedRef = useRef(false);

  const [step, setStep] = useState<WalletStep>(() =>
    recoveryMode && initialStep ? initialStep : 'main',
  );
  const [paymentSetupOpen, setPaymentSetupOpen] = useState(
    () => recoveryMode && openPaymentSetupOnMount,
  );
  const [addressSetupOpen, setAddressSetupOpen] = useState(false);
  const [addressModalDraft, setAddressModalDraft] = useState<CreateShippingAddressInput | null>(null);
  const [addressModalEditing, setAddressModalEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [readiness, setReadiness] = useState<BuyerWalletReadiness | null>(initialReadiness ?? null);
  const [paymentMethods, setPaymentMethods] = useState<BuyerPaymentMethodRow[]>([]);
  const [addresses, setAddresses] = useState<BuyerShippingAddressRow[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadInFlight = useRef(false);

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
      const [nextReadiness, pmRes, addrList] = await Promise.all([
        fetchBuyerWalletReadiness(accessToken, roomId),
        fetchBuyerPaymentMethods(accessToken).catch(() => ({
          paymentMethods: [] as BuyerPaymentMethodRow[],
          stripeConfigured: false,
        })),
        fetchBuyerShippingAddresses(accessToken).catch(() => [] as BuyerShippingAddressRow[]),
      ]);
      if (nextReadiness) {
        setReadiness(nextReadiness);
        onReadinessChange?.(nextReadiness);
      }
      setPaymentMethods(pmRes.paymentMethods);
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
    if (visible && recoveryMode) {
      console.log('[payment failure] wallet sheet visible');
    }
    return () => onActiveChange?.(false);
  }, [visible, onActiveChange, recoveryMode]);

  const openPaymentSetup = () => setPaymentSetupOpen(true);

  useEffect(() => {
    if (!visible) {
      setStep('main');
      setPaymentSetupOpen(false);
      setAddressSetupOpen(false);
      setAddressModalDraft(null);
      setActionError(null);
      openSeedAppliedRef.current = false;
      return;
    }
    if (initialReadiness && !openSeedAppliedRef.current) {
      setReadiness(initialReadiness);
      openSeedAppliedRef.current = true;
    }
    setStep(recoveryMode ? initialStep : 'main');
    if (recoveryMode && openPaymentSetupOnMount) {
      setPaymentSetupOpen(true);
    }
    void loadRef.current();
  }, [visible, recoveryMode, initialStep, openPaymentSetupOnMount]);

  const goMain = () => setStep('main');

  const openAddAddress = (seed?: BuyerShippingAddressRow) => {
    if (seed) {
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
      setAddressModalDraft(EMPTY_ADDRESS);
      setAddressModalEditing(false);
    }
    setAddressSetupOpen(true);
  };

  const finishWalletSetup = () => {
    if (!shippingReady) {
      if (addresses.length === 0) {
        openAddAddress();
      } else {
        setStep('delivery');
      }
      return;
    }
    if (!paymentReady) {
      setStep('payment');
      return;
    }
    onClose();
  };

  const primaryLabel = walletReady
    ? 'Wallet ready. Bid again when you\'re ready.'
    : 'Finish Wallet Setup';

  const renderMain = () => (
    <>
      <SheetHeader title="Wallet" />
      {actionError ? <LiveRoomText style={s.errorText}>{actionError}</LiveRoomText> : null}
      <ScrollView
        style={s.scrollBody}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <NavRow
          icon="car-outline"
          title="Delivery Method"
          subtitle={formatAddressOneLine(defaultAddress)}
          missing={!shippingReady}
          onPress={() => setStep('delivery')}
        />
        <NavRow
          icon="card-outline"
          title="Payment"
          subtitle={formatPaymentSummary(primaryPayment)}
          missing={!paymentReady}
          onPress={() => setStep('payment')}
        />
        {loading ? (
          <View style={s.loadingRow}>
            <ActivityIndicator color={colors.gold} size="small" />
            <LiveRoomText style={s.loadingText}>Refreshing wallet…</LiveRoomText>
          </View>
        ) : null}
      </ScrollView>
      <View style={s.footer}>
        <Pressable
          style={[s.primaryBtn, loading && s.primaryBtnDisabled]}
          onPress={walletReady ? onClose : finishWalletSetup}
          disabled={loading}
        >
          <LiveRoomText style={s.primaryBtnText}>{primaryLabel}</LiveRoomText>
        </Pressable>
        <Pressable style={s.secondaryBtn} onPress={onClose}>
          <LiveRoomText style={s.secondaryBtnText}>Stay in live room</LiveRoomText>
        </Pressable>
      </View>
    </>
  );

  const renderDelivery = () => (
    <>
      <SheetHeader title="Delivery Methods" onBack={goMain} />
      <ScrollView
        style={s.scrollBody}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={s.radioRow}>
          <View style={s.radioOuter}>
            <View style={s.radioInner} />
          </View>
          <LiveRoomText style={s.navRowTitle}>Shipping</LiveRoomText>
        </View>
        {defaultAddress ? (
          <View style={s.card}>
            <LiveRoomText style={s.cardTitle}>{defaultAddress.fullName}</LiveRoomText>
            <LiveRoomText style={s.cardBody}>{formatAddressBlock(defaultAddress)}</LiveRoomText>
            {defaultAddress.isDefault ? (
              <View style={s.badge}>
                <LiveRoomText style={s.badgeText}>Default</LiveRoomText>
              </View>
            ) : null}
            <Pressable style={s.linkBtn} onPress={() => openAddAddress(defaultAddress)}>
              <LiveRoomText style={s.linkBtnText}>Edit Address</LiveRoomText>
            </Pressable>
          </View>
        ) : (
          <LiveRoomText style={s.navRowSubMissing}>Add shipping address</LiveRoomText>
        )}
        <Pressable style={s.linkBtn} onPress={() => (addresses.length ? setStep('addresses') : openAddAddress())}>
          <LiveRoomText style={s.linkBtnText}>
            {addresses.length ? 'Manage addresses' : 'Add Address'}
          </LiveRoomText>
        </Pressable>
      </ScrollView>
      <View style={s.footer}>
        <Pressable style={s.primaryBtn} onPress={goMain}>
          <LiveRoomText style={s.primaryBtnText}>Save</LiveRoomText>
        </Pressable>
      </View>
    </>
  );

  const renderAddresses = () => (
    <>
      <SheetHeader
        title="Addresses"
        onBack={() => setStep(defaultAddress ? 'delivery' : 'main')}
        rightSlot={
          <Pressable style={s.plusBtn} onPress={() => openAddAddress()} hitSlop={8}>
            <Ionicons name="add" size={22} color={colors.gold} />
          </Pressable>
        }
      />
      <ScrollView
        style={s.scrollBody}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {addresses.length === 0 ? (
          <LiveRoomText style={s.navRowSub}>No shipping addresses saved yet.</LiveRoomText>
        ) : (
          addresses.map((addr) => (
            <Pressable key={addr.id} style={s.card} onPress={() => openAddAddress(addr)}>
              <LiveRoomText style={s.cardTitle}>{addr.fullName}</LiveRoomText>
              <LiveRoomText style={s.cardBody}>{formatAddressBlock(addr)}</LiveRoomText>
              {addr.isDefault ? (
                <View style={s.badge}>
                  <LiveRoomText style={s.badgeText}>Default</LiveRoomText>
                </View>
              ) : null}
              <LiveRoomText style={[s.linkBtnText, { marginTop: 4 }]}>Edit</LiveRoomText>
            </Pressable>
          ))
        )}
        <Pressable style={s.linkBtn} onPress={() => openAddAddress()}>
          <LiveRoomText style={s.linkBtnText}>+ Add new address</LiveRoomText>
        </Pressable>
      </ScrollView>
      <View style={s.footer}>
        <Pressable style={s.primaryBtn} onPress={goMain}>
          <LiveRoomText style={s.primaryBtnText}>Done</LiveRoomText>
        </Pressable>
      </View>
    </>
  );

  const renderPayment = () => (
    <>
      <SheetHeader title="Select Payment Method" onBack={goMain} />
      <ScrollView
        style={s.scrollBody}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {paymentMethods.length === 0 ? (
          <LiveRoomText style={s.navRowSubMissing}>Add payment method</LiveRoomText>
        ) : (
          paymentMethods.map((pm) => (
            <View key={pm.id} style={s.card}>
              <LiveRoomText style={s.cardTitle}>
                {pm.brand} ···· {pm.last4}
              </LiveRoomText>
              <LiveRoomText style={s.cardBody}>
                Expires {formatCardExp(pm.expMonth, pm.expYear)}
              </LiveRoomText>
            </View>
          ))
        )}
        <Pressable style={s.navRow} onPress={openPaymentSetup}>
          <View style={s.navIconWrap}>
            <Ionicons name="add" size={20} color={colors.gold} />
          </View>
          <LiveRoomText style={s.navRowTitle}>Add Payment Method</LiveRoomText>
          <Ionicons name="chevron-forward" size={18} color="#fff" style={s.chevron} />
        </Pressable>
      </ScrollView>
      <View style={s.footer}>
        {recoveryMode ? (
          <Pressable style={s.primaryBtn} onPress={() => onPaymentMethodSaved?.()}>
            <LiveRoomText style={s.primaryBtnText}>Retry payment</LiveRoomText>
          </Pressable>
        ) : null}
        <Pressable style={recoveryMode ? s.secondaryBtn : s.primaryBtn} onPress={goMain}>
          <LiveRoomText style={recoveryMode ? s.secondaryBtnText : s.primaryBtnText}>Done</LiveRoomText>
        </Pressable>
      </View>
    </>
  );

  const renderStep = () => {
    switch (step) {
      case 'delivery':
        return renderDelivery();
      case 'addresses':
        return renderAddresses();
      case 'payment':
        return renderPayment();
      case 'main':
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
        <View style={s.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={recoveryMode ? undefined : step === 'main' ? onClose : undefined}
            accessibilityLabel="Dismiss wallet sheet"
          />
          <KeyboardAvoidingView
            style={[s.sheetKeyboardWrap, { maxHeight: sheetMaxHeight }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 10 : 0}
          >
            <View style={[s.sheet, { paddingBottom: safeBottom }]}>
              <View style={s.handle} />
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
        initialDraft={addressModalDraft ?? undefined}
        onClose={() => setAddressSetupOpen(false)}
        onSaved={() => {
          void loadWalletData();
          setAddressSetupOpen(false);
          setStep(addressModalEditing ? 'addresses' : 'delivery');
        }}
      />
    </>
  );
}

/** @deprecated Use WalletSheet — kept for existing imports. */
export const WalletRequirementSheet = WalletSheet;
