import { Ionicons } from '@expo/vector-icons';
import {
  CardField,
  StripeProvider,
  confirmSetupIntent,
  useStripe,
} from '@stripe/stripe-react-native';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createBuyerSetupIntent,
  type BuyerSetupIntentPayload,
} from '../../api/buyerWalletRepository';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from '../live/LiveRoomText';
import { WALLET_CARD_FIELD_PLACEHOLDERS, WALLET_CARD_FIELD_STYLE } from './walletCardFieldStyle';
import { useKeyboardInset } from './walletSheetKeyboard';
import { walletPaymentSetupStyles as ps } from './walletPaymentSetupStyles';

type Props = {
  visible: boolean;
  accessToken?: string;
  onClose: () => void;
  onSaved: () => void;
};

function PaymentSetupHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={ps.headerRow}>
      <Pressable onPress={onBack} hitSlop={12} style={ps.headerSpacer}>
        <Ionicons name="chevron-back" size={24} color={colors.gold} />
      </Pressable>
      <LiveRoomText style={ps.headerTitle}>Add Payment Method</LiveRoomText>
      <View style={ps.headerSpacer} />
    </View>
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
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [useManualCard, setUseManualCard] = useState(false);
  const [sheetReady, setSheetReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const initStartedRef = useRef(false);

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
            primary: '#d4af37',
            background: '#121016',
            componentBackground: '#f4f4f5',
            componentBorder: '#d4af37',
            componentDivider: '#e4e4e7',
            primaryText: '#ffffff',
            secondaryText: '#a1a1aa',
            componentText: '#18181b',
            placeholderText: '#71717a',
            icon: '#18181b',
          },
          shapes: {
            borderRadius: 10,
            borderWidth: 2,
          },
        },
      });
      if (stripeInitError) {
        setInitError(stripeInitError.message ?? 'Stripe payment sheet unavailable.');
        setUseManualCard(true);
        return;
      }
      setSheetReady(true);
    } catch (e) {
      setInitError(e instanceof Error ? e.message : 'Stripe payment sheet unavailable.');
      setUseManualCard(true);
    }
  }, [initPaymentSheet, payload]);

  useEffect(() => {
    initStartedRef.current = false;
    setUseManualCard(false);
    setSheetReady(false);
    setInitError(null);
    setError(null);
    setCardComplete(false);
    void initPaymentSheetFlow();
  }, [payload.clientSecret, initPaymentSheetFlow]);

  const presentSheet = async () => {
    if (!sheetReady || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === 'Canceled') return;
        setError(presentError.message ?? 'Payment method could not be saved.');
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const saveManualCard = async () => {
    if (!cardComplete || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: stripeError } = await confirmSetupIntent(payload.clientSecret, {
        paymentMethodType: 'Card',
      });
      if (stripeError) {
        setError(stripeError.message ?? 'Card could not be saved.');
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const footerPadding = Math.max(insets.bottom, spacing.lg);
  const scrollBottomPad = keyboardInset + footerPadding + 72;

  return (
    <KeyboardAvoidingView
      style={ps.body}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <PaymentSetupHeader onBack={onClose} />
      <ScrollView
        style={ps.scroll}
        contentContainerStyle={[ps.scrollContent, { paddingBottom: scrollBottomPad }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <LiveRoomText style={ps.subtitle}>
          Cards are saved securely with Stripe for live bids and auction wins.
        </LiveRoomText>

        {error ? <LiveRoomText style={ps.errorText}>{error}</LiveRoomText> : null}

        {!useManualCard ? (
          <View style={ps.introCard}>
            <View style={ps.iconRow}>
              <Ionicons name="card-outline" size={22} color={colors.gold} />
              {Platform.OS === 'ios' && payload.applePayEnabled !== false ? (
                <Ionicons name="logo-apple" size={22} color="#fff" />
              ) : null}
            </View>
            <LiveRoomText style={ps.introTitle}>Secure Stripe checkout</LiveRoomText>
            <LiveRoomText style={ps.introBody}>
              Add your card or Apple Pay through Stripe&apos;s native payment sheet. Everything stays in the
              app — no browser.
            </LiveRoomText>
            {!sheetReady ? (
              <View style={ps.loadingRow}>
                <ActivityIndicator color={colors.gold} />
                <LiveRoomText style={ps.loadingText}>Preparing Stripe…</LiveRoomText>
              </View>
            ) : null}
          </View>
        ) : (
          <>
            {initError ? (
              <LiveRoomText style={ps.hintText}>{initError} Enter your card below.</LiveRoomText>
            ) : null}
            <View style={ps.cardFieldWrap}>
              <LiveRoomText style={ps.cardFieldLabel}>Card details</LiveRoomText>
              <CardField
                postalCodeEnabled
                placeholders={WALLET_CARD_FIELD_PLACEHOLDERS}
                cardStyle={WALLET_CARD_FIELD_STYLE}
                style={ps.cardFieldFixed}
                onCardChange={(details) => setCardComplete(details.complete)}
              />
            </View>
          </>
        )}
      </ScrollView>

      <View style={[ps.footer, { paddingBottom: footerPadding + keyboardInset }]}>
        {!useManualCard ? (
          <Pressable
            style={[ps.primaryBtn, (!sheetReady || busy) && ps.primaryBtnDisabled]}
            onPress={() => void presentSheet()}
            disabled={!sheetReady || busy}
          >
            {busy ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <LiveRoomText style={ps.primaryBtnText}>Add card with Stripe</LiveRoomText>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[ps.primaryBtn, (!cardComplete || busy) && ps.primaryBtnDisabled]}
            onPress={() => void saveManualCard()}
            disabled={!cardComplete || busy}
          >
            {busy ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <LiveRoomText style={ps.primaryBtnText}>Save payment method</LiveRoomText>
            )}
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function PaymentSetupLoader({ onClose }: { onClose: () => void }) {
  return (
    <View style={ps.body}>
      <PaymentSetupHeader onBack={onClose} />
      <View style={ps.loadingRow}>
        <ActivityIndicator color={colors.gold} />
        <LiveRoomText style={ps.loadingText}>Preparing secure payment…</LiveRoomText>
      </View>
    </View>
  );
}

/** Full-screen slide-up payment setup — separate from the wallet bottom sheet. */
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
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={ps.screen} edges={['top', 'left', 'right']}>
        {loading ? (
          <PaymentSetupLoader onClose={onClose} />
        ) : error || !payload ? (
          <View style={ps.body}>
            <PaymentSetupHeader onClose={onClose} />
            <View style={ps.scrollContent}>
              <LiveRoomText style={ps.errorText}>{error ?? 'Could not start card setup.'}</LiveRoomText>
            </View>
          </View>
        ) : (
          <StripeProvider publishableKey={payload.publishableKey}>
            <WalletPaymentSetupInner onClose={onClose} onSaved={onSaved} payload={payload} />
          </StripeProvider>
        )}
      </SafeAreaView>
    </Modal>
  );
}

/** @deprecated Use WalletPaymentSetupModal */
export const WalletPaymentSetupStep = WalletPaymentSetupModal;
