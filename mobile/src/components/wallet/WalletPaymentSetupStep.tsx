import { Ionicons } from '@expo/vector-icons';
import {
  mapLivePaymentFailureMessage,
  recoveryStatusMessage,
} from '../../lib/livePaymentFailureCopy';
import * as Linking from 'expo-linking';
import {
  CardForm,
  StripeProvider,
  confirmSetupIntent,
  useStripe,
} from '@stripe/stripe-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createBuyerSetupIntent,
  finalizeBuyerPaymentMethodSetup,
  FinalizePaymentMethodError,
  type BuyerSetupIntentPayload,
} from '../../api/buyerWalletRepository';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from '../live/LiveRoomText';
import {
  WALLET_CARD_FIELD_PLACEHOLDERS,
  WALLET_CARD_FORM_STYLE,
} from './walletCardFieldStyle';
import { usePaymentFormLightAppearance } from './usePaymentFormLightAppearance';
import { paymentMethodIdFromSetupIntent } from '../../lib/walletPaymentMethodFinalize';
import {
  WALLET_BILLING_COUNTRIES,
  billingCountryLabel,
} from './walletPaymentSetupCountries';
import { WalletNativePayButton } from './WalletNativePayButton';
import { walletPaymentSetupStyles as ps } from './walletPaymentSetupStyles';
import {
  catalogEntryIcon,
  liveAcceptedWalletMethods,
  LIVE_PREMIUM_WALLET_TITLE,
} from '../../lib/livePremiumWallet';

type Props = {
  visible: boolean;
  accessToken?: string;
  onClose: () => void;
  onSaved: (paymentMethodId?: string) => void;
};

/** Fixed header + scrollable body + sticky footer; single KeyboardAvoidingView (no manual keyboard inset). */
function PaymentSetupScreenShell({
  onClose,
  footer,
  children,
  keyboardAware = true,
}: {
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  keyboardAware?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const footerPad = Math.max(insets.bottom, spacing.sm);

  const scrollAndFooter = (
    <>
      <ScrollView
        style={ps.scroll}
        contentContainerStyle={ps.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {children}
      </ScrollView>
      <View style={[ps.footer, { paddingBottom: footerPad }]}>{footer}</View>
    </>
  );

  return (
    <View style={ps.body}>
      <PaymentSetupHeader onBack={onClose} />
      {keyboardAware ? (
        <KeyboardAvoidingView
          style={ps.keyboardFrame}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {scrollAndFooter}
        </KeyboardAvoidingView>
      ) : (
        <View style={ps.keyboardFrame}>{scrollAndFooter}</View>
      )}
    </View>
  );
}

function PaymentSetupHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={ps.headerRow}>
      <Pressable onPress={onBack} hitSlop={12} style={ps.headerSpacer}>
        <Ionicons name="chevron-back" size={24} color="#18181B" />
      </Pressable>
      <LiveRoomText style={ps.headerTitle}>Add Payment Method</LiveRoomText>
      <View style={ps.headerSpacer} />
    </View>
  );
}

function CountryPickerModal({
  visible,
  selectedCode,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedCode: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ps.countryPickerBackdrop} onPress={onClose}>
        <Pressable style={ps.countryPickerSheet} onPress={() => undefined}>
          <LiveRoomText style={ps.countryPickerTitle}>Country / region</LiveRoomText>
          <ScrollView keyboardShouldPersistTaps="handled">
            {WALLET_BILLING_COUNTRIES.map((country) => (
              <Pressable
                key={country.code}
                style={[
                  ps.countryOption,
                  country.code === selectedCode && ps.countryOptionSelected,
                ]}
                onPress={() => {
                  onSelect(country.code);
                  onClose();
                }}
              >
                <LiveRoomText style={ps.countryOptionText}>{country.label}</LiveRoomText>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LivePaymentMethodPicker({
  payload,
  onClose,
  onPickCard,
  onPickWallet,
}: {
  payload: BuyerSetupIntentPayload;
  onClose: () => void;
  onPickCard: () => void;
  onPickWallet: () => void;
}) {
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  const capabilities = {
    link: payload.linkEnabled === true,
    cashAppPay: payload.cashAppPayEnabled === true,
    amazonPay: payload.amazonPayEnabled === true,
    paypal: false,
  };
  const methods = liveAcceptedWalletMethods(platform, capabilities);

  return (
    <View style={ps.body}>
      <View style={ps.headerRowDark}>
        <Pressable onPress={onClose} hitSlop={12} style={ps.headerSpacer}>
          <Ionicons name="close" size={24} color="rgba(255,255,255,0.65)" />
        </Pressable>
        <LiveRoomText style={ps.headerTitleDark}>Add payment method</LiveRoomText>
        <View style={ps.headerSpacer} />
      </View>
      <LiveRoomText style={ps.pickerSubtitle}>
        You won&apos;t be charged until you win or buy on {LIVE_PREMIUM_WALLET_TITLE}.
      </LiveRoomText>
      <ScrollView style={ps.pickerList} showsVerticalScrollIndicator={false}>
        {methods.map((entry, idx) => {
          const isLast = idx === methods.length - 1;
          const onPress =
            entry.id === 'card'
              ? onPickCard
              : entry.id === 'apple_pay' || entry.id === 'google_pay'
                ? onPickWallet
                : onPickWallet;
          return (
            <Pressable
              key={entry.id}
              style={[ps.pickerRow, isLast && ps.pickerRowLast]}
              onPress={onPress}
            >
              <View style={ps.pickerIconWrap}>
                <Ionicons name={catalogEntryIcon(entry.id)} size={22} color="#fff" />
              </View>
              <LiveRoomText style={ps.pickerRowTitle}>{entry.label}</LiveRoomText>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.35)" />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function SupportedMethods({
  applePayEnabled,
  googlePayEnabled,
  linkEnabled,
  cashAppPayEnabled,
  amazonPayEnabled,
  paypalEnabled,
}: {
  applePayEnabled: boolean;
  googlePayEnabled: boolean;
  linkEnabled: boolean;
  cashAppPayEnabled: boolean;
  amazonPayEnabled: boolean;
  paypalEnabled: boolean;
}) {
  return (
    <View style={ps.sectionCard}>
      <View style={ps.methodRow}>
        <View style={ps.methodIconWrap}>
          <Ionicons name="card-outline" size={22} color="#18181B" />
        </View>
        <View style={ps.methodTextBlock}>
          <LiveRoomText style={ps.methodTitle}>Debit or credit card</LiveRoomText>
          <LiveRoomText style={ps.methodSub}>Visa, Mastercard, Amex, and more</LiveRoomText>
        </View>
      </View>
      {Platform.OS === 'ios' && applePayEnabled ? (
        <View style={ps.methodRow}>
          <View style={ps.methodIconWrap}>
            <Ionicons name="logo-apple" size={22} color="#18181B" />
          </View>
          <View style={ps.methodTextBlock}>
            <LiveRoomText style={ps.methodTitle}>Apple Pay</LiveRoomText>
            <LiveRoomText style={ps.methodSub}>When available on your device</LiveRoomText>
          </View>
        </View>
      ) : null}
      {Platform.OS === 'android' && googlePayEnabled ? (
        <View style={ps.methodRow}>
          <View style={ps.methodIconWrap}>
            <Ionicons name="logo-google" size={22} color="#18181B" />
          </View>
          <View style={ps.methodTextBlock}>
            <LiveRoomText style={ps.methodTitle}>Google Pay</LiveRoomText>
            <LiveRoomText style={ps.methodSub}>When available on your device</LiveRoomText>
          </View>
        </View>
      ) : null}
      {linkEnabled ? (
        <View style={ps.methodRow}>
          <View style={ps.methodIconWrap}>
            <Ionicons name="link-outline" size={22} color="#18181B" />
          </View>
          <View style={ps.methodTextBlock}>
            <LiveRoomText style={ps.methodTitle}>Link by Stripe</LiveRoomText>
            <LiveRoomText style={ps.methodSub}>Fast checkout with Link</LiveRoomText>
          </View>
        </View>
      ) : null}
      {cashAppPayEnabled ? (
        <View style={ps.methodRow}>
          <View style={ps.methodIconWrap}>
            <Ionicons name="cash-outline" size={22} color="#18181B" />
          </View>
          <View style={ps.methodTextBlock}>
            <LiveRoomText style={ps.methodTitle}>Cash App Pay</LiveRoomText>
            <LiveRoomText style={ps.methodSub}>Available for Live, Marketplace, and Trade</LiveRoomText>
          </View>
        </View>
      ) : null}
      {amazonPayEnabled ? (
        <View style={ps.methodRow}>
          <View style={ps.methodIconWrap}>
            <Ionicons name="logo-amazon" size={22} color="#18181B" />
          </View>
          <View style={ps.methodTextBlock}>
            <LiveRoomText style={ps.methodTitle}>Amazon Pay</LiveRoomText>
            <LiveRoomText style={ps.methodSub}>When supported in Stripe checkout</LiveRoomText>
          </View>
        </View>
      ) : null}
      {paypalEnabled ? (
        <View style={ps.methodRow}>
          <View style={ps.methodIconWrap}>
            <Ionicons name="logo-paypal" size={22} color="#18181B" />
          </View>
          <View style={ps.methodTextBlock}>
            <LiveRoomText style={ps.methodTitle}>PayPal</LiveRoomText>
            <LiveRoomText style={ps.methodSub}>Via Stripe when enabled in Dashboard</LiveRoomText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PaymentSheetLauncher({
  payload,
  sheetReady,
  busy,
  initError,
  onClose,
  onPresent,
}: {
  payload: BuyerSetupIntentPayload;
  sheetReady: boolean;
  busy: boolean;
  initError: string | null;
  onClose: () => void;
  onPresent: () => void;
}) {
  return (
    <PaymentSetupScreenShell
      onClose={onClose}
      keyboardAware={false}
      footer={
        <Pressable
          style={[ps.primaryBtn, (!sheetReady || busy) && ps.primaryBtnDisabled]}
          onPress={onPresent}
          disabled={!sheetReady || busy}
        >
          {busy || !sheetReady ? (
            <ActivityIndicator color="#111111" />
          ) : (
            <LiveRoomText
              style={[
                ps.primaryBtnText,
                (!sheetReady || busy) && ps.primaryBtnTextDisabled,
              ]}
            >
              Continue with Stripe
            </LiveRoomText>
          )}
        </Pressable>
      }
    >
        <LiveRoomText style={ps.subtitle}>
          You won&apos;t be charged until you win or buy on live. Saved securely with Stripe for your Vault Wallet.
        </LiveRoomText>
      <View style={ps.section}>
        <LiveRoomText style={ps.sectionTitle}>Add with Apple Pay or Google Pay</LiveRoomText>
        <WalletNativePayButton
          publishableKey={payload.publishableKey}
          onPress={onPresent}
          appearance="light"
        />
      </View>
      <View style={ps.section}>
        <LiveRoomText style={ps.sectionTitle}>Supported methods</LiveRoomText>
        <SupportedMethods
          applePayEnabled={payload.applePayEnabled !== false}
          googlePayEnabled={payload.googlePayEnabled !== false}
          linkEnabled={payload.linkEnabled === true}
          cashAppPayEnabled={payload.cashAppPayEnabled === true}
          amazonPayEnabled={payload.amazonPayEnabled === true}
          paypalEnabled={false}
        />
      </View>
      <LiveRoomText style={ps.scanHint}>
        Stripe checkout includes card scanning on supported devices. Everything stays in the app — no
        browser.
      </LiveRoomText>
      {initError ? <LiveRoomText style={ps.errorText}>{initError}</LiveRoomText> : null}
    </PaymentSetupScreenShell>
  );
}

function ManualCardEntry({
  initError,
  busy,
  onClose,
  onSave,
  stripeNativeReady,
}: {
  initError: string | null;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
  stripeNativeReady: boolean;
}) {
  const [cardComplete, setCardComplete] = useState(false);
  const [billingCountry, setBillingCountry] = useState('US');
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);

  return (
    <>
      <PaymentSetupScreenShell
        onClose={onClose}
        footer={
          <Pressable
            style={[ps.primaryBtn, (!cardComplete || busy) && ps.primaryBtnDisabled]}
            onPress={onSave}
            disabled={!cardComplete || busy}
          >
            {busy ? (
              <ActivityIndicator color="#111111" />
            ) : (
              <LiveRoomText
                style={[
                  ps.primaryBtnText,
                  (!cardComplete || busy) && ps.primaryBtnTextDisabled,
                ]}
              >
                Save payment method
              </LiveRoomText>
            )}
          </Pressable>
        }
      >
        <LiveRoomText style={ps.subtitle}>
          Cards are saved securely with Stripe for live bids and auction wins.
        </LiveRoomText>
        {initError ? <LiveRoomText style={ps.errorText}>{initError}</LiveRoomText> : null}

        <View style={ps.section}>
          <LiveRoomText style={ps.sectionTitle}>Card information</LiveRoomText>
          <View style={ps.cardFormWrap}>
            {stripeNativeReady ? (
              <CardForm
                key={billingCountry}
                autofocus={false}
                placeholders={WALLET_CARD_FIELD_PLACEHOLDERS}
                cardStyle={WALLET_CARD_FORM_STYLE}
                defaultValues={{ countryCode: billingCountry }}
                style={ps.cardForm}
                onFormComplete={(details) => setCardComplete(details.complete)}
              />
            ) : (
              <View style={[ps.cardForm, ps.cardFormLoading]}>
                <ActivityIndicator color="#71717A" />
              </View>
            )}
          </View>
          <LiveRoomText style={ps.hintText}>
            Enter card number on the first row, expiry and CVC on the second, billing ZIP below.
          </LiveRoomText>
        </View>

        <View style={ps.section}>
          <LiveRoomText style={ps.sectionTitle}>Billing</LiveRoomText>
          <View style={ps.sectionCard}>
            <LiveRoomText style={ps.fieldLabel}>Country / region</LiveRoomText>
            <Pressable style={ps.fieldRow} onPress={() => setCountryPickerOpen(true)}>
              <LiveRoomText style={ps.fieldValue}>{billingCountryLabel(billingCountry)}</LiveRoomText>
              <Ionicons name="chevron-down" size={18} color="#71717A" />
            </Pressable>
            <View style={ps.switchRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <LiveRoomText style={ps.switchLabel}>Use shipping address</LiveRoomText>
                <LiveRoomText style={ps.switchHint}>Coming soon</LiveRoomText>
              </View>
              <Switch value={false} disabled trackColor={{ true: colors.gold, false: '#E4E4E7' }} />
            </View>
          </View>
        </View>
      </PaymentSetupScreenShell>

      <CountryPickerModal
        visible={countryPickerOpen}
        selectedCode={billingCountry}
        onSelect={setBillingCountry}
        onClose={() => setCountryPickerOpen(false)}
      />
    </>
  );
}

function WalletPaymentSetupInner({
  accessToken,
  onClose,
  onSaved,
  payload,
  stripeNativeReady,
}: {
  accessToken?: string;
  onClose: () => void;
  onSaved: (paymentMethodId?: string) => void;
  payload: BuyerSetupIntentPayload;
  stripeNativeReady: boolean;
}) {
  const { initPaymentSheet, presentPaymentSheet, confirmSetupIntent, retrieveSetupIntent } = useStripe();
  const [useManualCard, setUseManualCard] = useState(false);
  const [sheetReady, setSheetReady] = useState(false);
  const [showPicker, setShowPicker] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const initStartedRef = useRef(false);
  const autoPresentedRef = useRef(false);

  const completeSavedPaymentMethod = useCallback(async (paymentMethodId?: string | null) => {
    if (!accessToken?.trim()) {
      setInitError('Sign in to save your payment method.');
      console.log('[wallet] finalize payment method fail (no access token)');
      return;
    }
    let finalizedPaymentMethodId = paymentMethodId ?? null;
    try {
      const finalized = await finalizeBuyerPaymentMethodSetup(accessToken, {
        ...(paymentMethodId?.startsWith('pm_') ? { paymentMethodId } : {}),
        clientSecret: payload.clientSecret,
      });
      finalizedPaymentMethodId = finalized.paymentMethodId;
      console.log('[wallet] payment method finalized', {
        paymentMethodId: finalized.paymentMethodId,
        exp_month: finalized.expMonth,
        exp_year: finalized.expYear,
      });
    } catch (e) {
      const status = e instanceof FinalizePaymentMethodError ? e.status : undefined;
      const msg =
        recoveryStatusMessage(status) ??
        (e instanceof Error ? e.message : 'Could not finalize payment method.');
      console.log('[wallet] finalize payment method fail', { status: status ?? null, msg });
      setInitError(msg);
      return;
    }
    if (!finalizedPaymentMethodId?.startsWith('pm_')) {
      const msg = recoveryStatusMessage(400) ?? 'Card save did not return a payment method. Try again.';
      setInitError(msg);
      console.log('[wallet] finalize payment method fail (missing paymentMethodId)');
      return;
    }
    onSaved(finalizedPaymentMethodId);
  }, [accessToken, onSaved, payload.clientSecret]);

  const initPaymentSheetFlow = useCallback(async () => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;
    setInitError(null);
    try {
      const returnURL = Linking.createURL('stripe-redirect');
      const { error: stripeInitError } = await initPaymentSheet({
        setupIntentClientSecret: payload.clientSecret,
        merchantDisplayName: 'Get Vaulted',
        returnURL,
        allowsDelayedPaymentMethods: false,
        applePay:
          Platform.OS === 'ios' && payload.applePayEnabled !== false
            ? { merchantCountryCode: payload.merchantCountryCode ?? 'US' }
            : undefined,
        googlePay:
          Platform.OS === 'android' && payload.googlePayEnabled !== false
            ? { merchantCountryCode: payload.merchantCountryCode ?? 'US', testEnv: __DEV__ }
            : undefined,
        appearance: {
          colors: {
            primary: '#D4AF37',
            background: '#FFFFFF',
            componentBackground: '#FFFFFF',
            componentBorder: '#D1D5DB',
            componentDivider: '#E4E4E7',
            primaryText: '#111111',
            secondaryText: '#52525B',
            componentText: '#111111',
            placeholderText: '#9CA3AF',
            icon: '#111111',
          },
          shapes: {
            borderRadius: 12,
            borderWidth: 1,
          },
        },
      });
      if (stripeInitError) {
        setInitError(mapLivePaymentFailureMessage(stripeInitError.message, stripeInitError.code));
        setUseManualCard(true);
        return;
      }
      setSheetReady(true);
    } catch (e) {
      setInitError(mapLivePaymentFailureMessage(e instanceof Error ? e.message : null));
      setUseManualCard(true);
    }
  }, [initPaymentSheet, payload]);

  useEffect(() => {
    initStartedRef.current = false;
    autoPresentedRef.current = false;
    setUseManualCard(false);
    setSheetReady(false);
    setShowPicker(true);
    setInitError(null);
    setBusy(false);
    void initPaymentSheetFlow();
  }, [payload.clientSecret, initPaymentSheetFlow]);

  const presentSheet = useCallback(async (): Promise<
    { outcome: 'saved'; paymentMethodId: string } | { outcome: 'cancelled' | 'failed' }
  > => {
    if (!sheetReady || busy) return { outcome: 'failed' };
    setBusy(true);
    try {
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === 'Canceled') return { outcome: 'cancelled' };
        setInitError(mapLivePaymentFailureMessage(presentError.message, presentError.code));
        setShowPicker(true);
        return { outcome: 'failed' };
      }
      const retrieved = await retrieveSetupIntent(payload.clientSecret);
      if (retrieved.error) {
        setInitError(mapLivePaymentFailureMessage(retrieved.error.message, retrieved.error.code));
        setShowPicker(true);
        return { outcome: 'failed' };
      }
      const paymentMethodId = paymentMethodIdFromSetupIntent(retrieved.setupIntent);
      if (!paymentMethodId) {
        setInitError('Could not read saved card details. Try again.');
        setShowPicker(true);
        return { outcome: 'failed' };
      }
      return { outcome: 'saved', paymentMethodId };
    } finally {
      setBusy(false);
    }
  }, [busy, payload.clientSecret, presentPaymentSheet, retrieveSetupIntent, sheetReady]);

  const saveManualCard = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error: stripeError } = await confirmSetupIntent(payload.clientSecret, {
        paymentMethodType: 'Card',
      });
      if (stripeError) {
        setInitError(mapLivePaymentFailureMessage(stripeError.message, stripeError.code));
        return;
      }
      const retrieved = await retrieveSetupIntent(payload.clientSecret);
      if (retrieved.error) {
        setInitError(mapLivePaymentFailureMessage(retrieved.error.message, retrieved.error.code));
        return;
      }
      const paymentMethodId = paymentMethodIdFromSetupIntent(retrieved.setupIntent);
      await completeSavedPaymentMethod(paymentMethodId);
    } finally {
      setBusy(false);
    }
  };

  if (useManualCard) {
    return (
      <ManualCardEntry
        initError={initError}
        busy={busy}
        onClose={onClose}
        onSave={() => void saveManualCard()}
        stripeNativeReady={stripeNativeReady}
      />
    );
  }

  if (showPicker && !useManualCard) {
    return (
      <LivePaymentMethodPicker
        payload={payload}
        onClose={onClose}
        onPickCard={() => {
          setShowPicker(false);
          setUseManualCard(true);
        }}
        onPickWallet={() => {
          setShowPicker(false);
          autoPresentedRef.current = true;
          void (async () => {
            const result = await presentSheet();
            if (result.outcome === 'saved') await completeSavedPaymentMethod(result.paymentMethodId);
            if (result.outcome === 'cancelled' || result.outcome === 'failed') {
              autoPresentedRef.current = false;
              setShowPicker(true);
            }
          })();
        }}
      />
    );
  }

  if (!useManualCard && !sheetReady) {
    return (
      <View style={ps.loadingBlock}>
        <ActivityIndicator color={colors.gold} size="large" />
        <LiveRoomText style={ps.loadingText}>Preparing secure checkout…</LiveRoomText>
      </View>
    );
  }

  return (
    <View style={ps.loadingBlock}>
      <ActivityIndicator color={colors.gold} size="large" />
      <LiveRoomText style={ps.loadingText}>Opening secure Stripe checkout…</LiveRoomText>
    </View>
  );
}

function PaymentSetupLoader({ onClose }: { onClose: () => void }) {
  return (
    <View style={ps.body}>
      <PaymentSetupHeader onBack={onClose} />
      <View style={ps.loadingBlock}>
        <ActivityIndicator color={colors.gold} size="large" />
        <LiveRoomText style={ps.loadingText}>Preparing secure payment…</LiveRoomText>
      </View>
    </View>
  );
}

const STRIPE_MERCHANT_IDENTIFIER = 'merchant.com.getvaulted.app';
const STRIPE_URL_SCHEME = 'getvaulted';

/** Full-screen add-card flow over a dimmed live room — separate from the wallet bottom sheet. */
export function WalletPaymentSetupModal({ visible, accessToken, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<BuyerSetupIntentPayload | null>(null);
  const stripeNativeReady = usePaymentFormLightAppearance(visible);

  useEffect(() => {
    if (!visible) {
      setPayload(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (!accessToken) {
      setError('Sign in to add a payment method.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const next = await createBuyerSetupIntent(accessToken);
        if (!cancelled) setPayload(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not start card setup.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, accessToken]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={ps.backdrop}>
        <SafeAreaView style={ps.panelShell} edges={['top']}>
          <View style={ps.panelDark}>
            {loading ? (
              <PaymentSetupLoader onClose={onClose} />
            ) : error || !payload ? (
              <View style={ps.body}>
                <PaymentSetupHeader onBack={onClose} />
                <View style={ps.scrollContent}>
                  <LiveRoomText style={ps.errorText}>
                    {error ?? 'Could not start card setup.'}
                  </LiveRoomText>
                </View>
              </View>
            ) : (
              <StripeProvider
                publishableKey={payload.publishableKey}
                merchantIdentifier={STRIPE_MERCHANT_IDENTIFIER}
                urlScheme={STRIPE_URL_SCHEME}
              >
                <WalletPaymentSetupInner
                  accessToken={accessToken}
                  onClose={onClose}
                  onSaved={onSaved}
                  payload={payload}
                  stripeNativeReady={stripeNativeReady}
                />
              </StripeProvider>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** @deprecated Use WalletPaymentSetupModal */
export const WalletPaymentSetupStep = WalletPaymentSetupModal;
