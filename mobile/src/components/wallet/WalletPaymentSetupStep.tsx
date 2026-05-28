import { Ionicons } from '@expo/vector-icons';
import { mapLivePaymentFailureMessage } from '../../lib/livePaymentFailureCopy';
import {
  CardForm,
  StripeProvider,
  confirmSetupIntent,
  useStripe,
} from '@stripe/stripe-react-native';
import * as Linking from 'expo-linking';
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
  type BuyerSetupIntentPayload,
} from '../../api/buyerWalletRepository';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from '../live/LiveRoomText';
import {
  WALLET_CARD_FIELD_PLACEHOLDERS,
  WALLET_CARD_FORM_STYLE,
} from './walletCardFieldStyle';
import {
  WALLET_BILLING_COUNTRIES,
  billingCountryLabel,
} from './walletPaymentSetupCountries';
import { walletPaymentSetupStyles as ps } from './walletPaymentSetupStyles';

type Props = {
  visible: boolean;
  accessToken?: string;
  onClose: () => void;
  onSaved: () => void;
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

function SupportedMethods({ applePayEnabled }: { applePayEnabled: boolean }) {
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
            <ActivityIndicator color="#0A0A0A" />
          ) : (
            <LiveRoomText style={ps.primaryBtnText}>Add card with Stripe</LiveRoomText>
          )}
        </Pressable>
      }
    >
      <LiveRoomText style={ps.subtitle}>
        Cards are saved securely with Stripe for live bids and auction wins.
      </LiveRoomText>
      <View style={ps.section}>
        <LiveRoomText style={ps.sectionTitle}>Supported methods</LiveRoomText>
        <SupportedMethods applePayEnabled={payload.applePayEnabled !== false} />
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
  payload,
  initError,
  busy,
  onClose,
  onSave,
}: {
  payload: BuyerSetupIntentPayload;
  initError: string | null;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
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
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <LiveRoomText style={ps.primaryBtnText}>Save payment method</LiveRoomText>
            )}
          </Pressable>
        }
      >
        <LiveRoomText style={ps.subtitle}>
          Cards are saved securely with Stripe for live bids and auction wins.
        </LiveRoomText>
        {initError ? <LiveRoomText style={ps.hintText}>{initError}</LiveRoomText> : null}

        <View style={ps.section}>
          <LiveRoomText style={ps.sectionTitle}>Card information</LiveRoomText>
          <View style={ps.cardFormWrap}>
            <CardForm
              key={billingCountry}
              autofocus={false}
              placeholders={WALLET_CARD_FIELD_PLACEHOLDERS}
              cardStyle={WALLET_CARD_FORM_STYLE}
              defaultValues={{ countryCode: billingCountry }}
              style={ps.cardForm}
              onFormComplete={(details) => setCardComplete(details.complete)}
            />
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
  onClose,
  onSaved,
  payload,
}: {
  onClose: () => void;
  onSaved: () => void;
  payload: BuyerSetupIntentPayload;
}) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [useManualCard, setUseManualCard] = useState(false);
  const [sheetReady, setSheetReady] = useState(false);
  const [showLauncher, setShowLauncher] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const initStartedRef = useRef(false);
  const autoPresentedRef = useRef(false);

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
        appearance: {
          colors: {
            primary: '#D4AF37',
            background: '#FFFFFF',
            componentBackground: '#FFFFFF',
            componentBorder: '#D4D4D8',
            componentDivider: '#E4E4E7',
            primaryText: '#18181B',
            secondaryText: '#71717A',
            componentText: '#18181B',
            placeholderText: '#A1A1AA',
            icon: '#18181B',
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
    setShowLauncher(false);
    setInitError(null);
    setBusy(false);
    void initPaymentSheetFlow();
  }, [payload.clientSecret, initPaymentSheetFlow]);

  const presentSheet = useCallback(async (): Promise<'saved' | 'cancelled' | 'failed'> => {
    if (!sheetReady || busy) return 'failed';
    setBusy(true);
    try {
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === 'Canceled') return 'cancelled';
        setInitError(mapLivePaymentFailureMessage(presentError.message, presentError.code));
        setShowLauncher(true);
        return 'failed';
      }
      return 'saved';
    } finally {
      setBusy(false);
    }
  }, [busy, presentPaymentSheet, sheetReady]);

  useEffect(() => {
    if (!sheetReady || useManualCard || autoPresentedRef.current) return;
    autoPresentedRef.current = true;
    void (async () => {
      const result = await presentSheet();
      if (result === 'saved') onSaved();
      if (result === 'cancelled' || result === 'failed') setShowLauncher(true);
    })();
  }, [onSaved, presentSheet, sheetReady, useManualCard]);

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
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  if (useManualCard) {
    return (
      <ManualCardEntry
        payload={payload}
        initError={initError}
        busy={busy}
        onClose={onClose}
        onSave={() => void saveManualCard()}
      />
    );
  }

  if (showLauncher || !sheetReady) {
    return (
      <PaymentSheetLauncher
        payload={payload}
        sheetReady={sheetReady}
        busy={busy}
        initError={initError}
        onClose={onClose}
        onPresent={() => {
          void (async () => {
            const result = await presentSheet();
            if (result === 'saved') onSaved();
          })();
        }}
      />
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

/** Full-screen add-card flow over a dimmed live room — separate from the wallet bottom sheet. */
export function WalletPaymentSetupModal({ visible, accessToken, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<BuyerSetupIntentPayload | null>(null);

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
          <View style={ps.panel}>
            {loading ? (
              <PaymentSetupLoader onClose={onClose} />
            ) : error || !payload ? (
              <View style={ps.body}>
                <PaymentSetupHeader onClose={onClose} />
                <View style={ps.scrollContent}>
                  <LiveRoomText style={ps.errorText}>
                    {error ?? 'Could not start card setup.'}
                  </LiveRoomText>
                </View>
              </View>
            ) : (
              <StripeProvider publishableKey={payload.publishableKey}>
                <WalletPaymentSetupInner onClose={onClose} onSaved={onSaved} payload={payload} />
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
