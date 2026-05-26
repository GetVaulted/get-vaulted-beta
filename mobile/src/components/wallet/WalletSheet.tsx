import type { ReactNode, RefObject } from 'react';
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
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createBuyerShippingAddress,
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
import { WalletPaymentSetupStep } from './WalletPaymentSetupStep';

export type WalletStep = 'main' | 'delivery' | 'addresses' | 'payment' | 'addCard' | 'addAddress';

function useFormScrollAssist() {
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Record<string, number>>({});

  const registerField = useCallback((key: string, y: number) => {
    fieldOffsets.current[key] = y;
  }, []);

  const focusField = useCallback((key: string) => {
    const y = fieldOffsets.current[key] ?? 0;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
  }, []);

  return { scrollRef, registerField, focusField };
}

function FormStepLayout({
  header,
  footer,
  scrollRef,
  keyboardInset,
  safeBottom,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  scrollRef: RefObject<ScrollView | null>;
  keyboardInset: number;
  safeBottom: number;
  children: ReactNode;
}) {
  return (
    <>
      {header}
      <ScrollView
        ref={scrollRef}
        style={s.scrollBody}
        contentContainerStyle={[
          s.scrollContent,
          { paddingBottom: keyboardInset + safeBottom + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        {children}
      </ScrollView>
      <View style={s.footer}>{footer}</View>
    </>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  accessToken?: string;
  roomId: string;
  initialReadiness?: BuyerWalletReadiness | null;
  onReadinessChange?: (readiness: BuyerWalletReadiness) => void;
  onActiveChange?: (active: boolean) => void;
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
  rightSlot?: ReactNode;
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

function AddressField({
  label,
  value,
  onChange,
  placeholder,
  autoCapitalize = 'words',
  keyboardType = 'default',
  fieldKey,
  onFieldLayout,
  onFieldFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  keyboardType?: 'default' | 'number-pad';
  fieldKey: string;
  onFieldLayout: (key: string, y: number) => void;
  onFieldFocus: (key: string) => void;
}) {
  return (
    <View
      style={s.field}
      onLayout={(e) => onFieldLayout(fieldKey, e.nativeEvent.layout.y)}
    >
      <LiveRoomText style={s.fieldLabel}>{label}</LiveRoomText>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.35)"
        style={s.input}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        onFocus={() => onFieldFocus(fieldKey)}
      />
    </View>
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
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const sheetMaxHeight = Math.min(windowHeight * 0.9, 680);
  const safeBottom = Math.max(insets.bottom, spacing.lg);
  const addressFormScroll = useFormScrollAssist();
  const cardFormScroll = useFormScrollAssist();
  const openSeedAppliedRef = useRef(false);

  const [step, setStep] = useState<WalletStep>('main');
  const [loading, setLoading] = useState(false);
  const [readiness, setReadiness] = useState<BuyerWalletReadiness | null>(initialReadiness ?? null);
  const [paymentMethods, setPaymentMethods] = useState<BuyerPaymentMethodRow[]>([]);
  const [addresses, setAddresses] = useState<BuyerShippingAddressRow[]>([]);
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [addressEditing, setAddressEditing] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
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
    return () => onActiveChange?.(false);
  }, [visible, onActiveChange]);

  useEffect(() => {
    if (!visible) {
      setStep('main');
      setAddressDraft(EMPTY_ADDRESS);
      setAddressEditing(false);
      setAddressError(null);
      setActionError(null);
      openSeedAppliedRef.current = false;
      return;
    }
    if (initialReadiness && !openSeedAppliedRef.current) {
      setReadiness(initialReadiness);
      openSeedAppliedRef.current = true;
    }
    void loadRef.current();
  }, [visible]);

  const goMain = () => setStep('main');

  const openAddAddress = (seed?: BuyerShippingAddressRow) => {
    if (seed) {
      setAddressDraft({
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
      setAddressEditing(true);
    } else {
      setAddressDraft(EMPTY_ADDRESS);
      setAddressEditing(false);
    }
    setAddressError(null);
    setStep('addAddress');
  };

  const saveAddress = async () => {
    if (!accessToken || addressBusy) return;
    setAddressBusy(true);
    setAddressError(null);
    try {
      await createBuyerShippingAddress(accessToken, addressDraft);
      await loadWalletData();
      setStep(addressEditing ? 'addresses' : 'delivery');
      setAddressDraft(EMPTY_ADDRESS);
      setAddressEditing(false);
    } catch (e) {
      setAddressError(e instanceof Error ? e.message : 'Could not save address.');
    } finally {
      setAddressBusy(false);
    }
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
        <Pressable style={s.navRow} onPress={() => setStep('addCard')}>
          <View style={s.navIconWrap}>
            <Ionicons name="add" size={20} color={colors.gold} />
          </View>
          <LiveRoomText style={s.navRowTitle}>Add Payment Method</LiveRoomText>
          <Ionicons name="chevron-forward" size={18} color="#fff" style={s.chevron} />
        </Pressable>
      </ScrollView>
      <View style={s.footer}>
        <Pressable style={s.primaryBtn} onPress={goMain}>
          <LiveRoomText style={s.primaryBtnText}>Done</LiveRoomText>
        </Pressable>
      </View>
    </>
  );

  const renderAddCard = () => (
    <WalletPaymentSetupStep
      accessToken={accessToken}
      keyboardInset={keyboardInset}
      safeBottom={safeBottom}
      scrollRef={cardFormScroll.scrollRef}
      onBack={() => setStep('payment')}
      onSaved={() => {
        void loadWalletData().then(() => setStep('payment'));
      }}
    />
  );

  const renderAddAddress = () => (
    <FormStepLayout
      header={
        <SheetHeader
          title={addressEditing ? 'Edit Address' : 'Add Address'}
          onBack={() => setStep(addresses.length > 0 ? 'addresses' : 'delivery')}
        />
      }
      footer={
        <Pressable
          style={[s.primaryBtn, addressBusy && s.primaryBtnDisabled]}
          onPress={() => void saveAddress()}
          disabled={addressBusy}
        >
          {addressBusy ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <LiveRoomText style={s.primaryBtnText}>Save address</LiveRoomText>
          )}
        </Pressable>
      }
      scrollRef={addressFormScroll.scrollRef}
      keyboardInset={keyboardInset}
      safeBottom={safeBottom}
    >
      {addressError ? <LiveRoomText style={s.errorText}>{addressError}</LiveRoomText> : null}
      <AddressField
        fieldKey="name"
        onFieldLayout={addressFormScroll.registerField}
        onFieldFocus={addressFormScroll.focusField}
        label="Label"
        value={addressDraft.name}
        onChange={(v) => setAddressDraft((d) => ({ ...d, name: v }))}
        placeholder="Shipping"
      />
      <AddressField
        fieldKey="fullName"
        onFieldLayout={addressFormScroll.registerField}
        onFieldFocus={addressFormScroll.focusField}
        label="Full name"
        value={addressDraft.fullName}
        onChange={(v) => setAddressDraft((d) => ({ ...d, fullName: v }))}
        placeholder="Jane Collector"
      />
      <AddressField
        fieldKey="line1"
        onFieldLayout={addressFormScroll.registerField}
        onFieldFocus={addressFormScroll.focusField}
        label="Address line 1"
        value={addressDraft.line1}
        onChange={(v) => setAddressDraft((d) => ({ ...d, line1: v }))}
        placeholder="123 Main St"
      />
      <AddressField
        fieldKey="line2"
        onFieldLayout={addressFormScroll.registerField}
        onFieldFocus={addressFormScroll.focusField}
        label="Address line 2 (optional)"
        value={addressDraft.line2 ?? ''}
        onChange={(v) => setAddressDraft((d) => ({ ...d, line2: v }))}
        placeholder="Apt 4"
      />
      <AddressField
        fieldKey="city"
        onFieldLayout={addressFormScroll.registerField}
        onFieldFocus={addressFormScroll.focusField}
        label="City"
        value={addressDraft.city}
        onChange={(v) => setAddressDraft((d) => ({ ...d, city: v }))}
        placeholder="City"
      />
      <AddressField
        fieldKey="state"
        onFieldLayout={addressFormScroll.registerField}
        onFieldFocus={addressFormScroll.focusField}
        label="State / region"
        value={addressDraft.state}
        onChange={(v) => setAddressDraft((d) => ({ ...d, state: v }))}
        placeholder="CA"
      />
      <AddressField
        fieldKey="postalCode"
        onFieldLayout={addressFormScroll.registerField}
        onFieldFocus={addressFormScroll.focusField}
        label="Postal code"
        value={addressDraft.postalCode}
        onChange={(v) => setAddressDraft((d) => ({ ...d, postalCode: v }))}
        placeholder="90210"
        keyboardType="number-pad"
      />
      <AddressField
        fieldKey="country"
        onFieldLayout={addressFormScroll.registerField}
        onFieldFocus={addressFormScroll.focusField}
        label="Country (ISO)"
        value={addressDraft.country}
        onChange={(v) => setAddressDraft((d) => ({ ...d, country: v.toUpperCase().slice(0, 2) }))}
        placeholder="US"
        autoCapitalize="characters"
      />
      <View style={s.switchRow}>
        <LiveRoomText style={s.switchLabel}>Set as default shipping address</LiveRoomText>
        <Switch
          value={addressDraft.isDefault !== false}
          onValueChange={(v) => setAddressDraft((d) => ({ ...d, isDefault: v }))}
          trackColor={{ true: colors.gold }}
        />
      </View>
    </FormStepLayout>
  );

  const renderStep = () => {
    switch (step) {
      case 'delivery':
        return renderDelivery();
      case 'addresses':
        return renderAddresses();
      case 'payment':
        return renderPayment();
      case 'addCard':
        return renderAddCard();
      case 'addAddress':
        return renderAddAddress();
      case 'main':
      default:
        return renderMain();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={step === 'main' ? onClose : () => setStep('main')}
      statusBarTranslucent
    >
      <View style={s.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={step === 'main' ? onClose : undefined}
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
  );
}

/** @deprecated Use WalletSheet — kept for existing imports. */
export const WalletRequirementSheet = WalletSheet;
