import { Ionicons } from '@expo/vector-icons';
import {
  CardField,
  StripeProvider,
  confirmSetupIntent,
  useStripe,
} from '@stripe/stripe-react-native';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import {
  createBuyerSetupIntent,
  type BuyerSetupIntentPayload,
} from '../../api/buyerWalletRepository';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from '../live/LiveRoomText';
import { WALLET_CARD_FIELD_PLACEHOLDERS, WALLET_CARD_FIELD_STYLE } from './walletCardFieldStyle';
import { walletSheetStyles as s } from './walletSheetStyles';

type Props = {
  accessToken?: string;
  keyboardInset: number;
  safeBottom: number;
  scrollRef: RefObject<ScrollView | null>;
  onBack: () => void;
  onSaved: () => void;
};

function SheetHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={s.headerRow}>
      <Pressable onPress={onBack} hitSlop={12} style={s.headerSpacer}>
        <Ionicons name="chevron-back" size={24} color={colors.gold} />
      </Pressable>
      <LiveRoomText style={s.headerTitle}>{title}</LiveRoomText>
      <View style={s.headerSpacer} />
    </View>
  );
}

function WalletPaymentSetupInner({
  accessToken,
  keyboardInset,
  safeBottom,
  scrollRef,
  onBack,
  onSaved,
  payload,
}: Props & { payload: BuyerSetupIntentPayload }) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [mode, setMode] = useState<'paymentSheet' | 'manual'>('paymentSheet');
  const [sheetReady, setSheetReady] = useState(false);
  const [sheetInitError, setSheetInitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const initStartedRef = useRef(false);

  const initPaymentSheetFlow = useCallback(async () => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;
    setSheetInitError(null);
    try {
      const returnURL = Linking.createURL('stripe-redirect');
      const { error: initError } = await initPaymentSheet({
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
      if (initError) {
        setSheetInitError(initError.message ?? 'Could not open payment sheet.');
        setMode('manual');
        return;
      }
      setSheetReady(true);
    } catch (e) {
      setSheetInitError(e instanceof Error ? e.message : 'Could not open payment sheet.');
      setMode('manual');
    }
  }, [initPaymentSheet, payload]);

  useEffect(() => {
    void initPaymentSheetFlow();
  }, [initPaymentSheetFlow]);

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

  const supportedLabel =
    payload.paymentMethodTypes?.includes('card') && Platform.OS === 'ios'
      ? 'Card and Apple Pay (when available on your device)'
      : 'Card';

  const footer =
    mode === 'paymentSheet' ? (
      <Pressable
        style={[s.primaryBtn, (!sheetReady || busy) && s.primaryBtnDisabled]}
        onPress={() => void presentSheet()}
        disabled={!sheetReady || busy}
      >
        {busy ? (
          <ActivityIndicator color="#0a0a0a" />
        ) : (
          <LiveRoomText style={s.primaryBtnText}>Add payment method</LiveRoomText>
        )}
      </Pressable>
    ) : (
      <Pressable
        style={[s.primaryBtn, (!cardComplete || busy) && s.primaryBtnDisabled]}
        onPress={() => void saveManualCard()}
        disabled={!cardComplete || busy}
      >
        {busy ? (
          <ActivityIndicator color="#0a0a0a" />
        ) : (
          <LiveRoomText style={s.primaryBtnText}>Save card</LiveRoomText>
        )}
      </Pressable>
    );

  return (
    <>
      <SheetHeader title="Add Payment Method" onBack={onBack} />
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
        <LiveRoomText style={s.navRowSub}>
          Add a saved payment method for live bids and auction wins. Payments stay in-app via Stripe.
        </LiveRoomText>
        <LiveRoomText style={s.paymentSupportLine}>Supported now: {supportedLabel}</LiveRoomText>

        {error ? <LiveRoomText style={s.errorText}>{error}</LiveRoomText> : null}
        {sheetInitError && mode === 'manual' ? (
          <LiveRoomText style={s.paymentHintText}>{sheetInitError} Enter your card below.</LiveRoomText>
        ) : null}

        {mode === 'paymentSheet' ? (
          <View style={s.paymentSheetIntro}>
            <View style={s.paymentSheetIconRow}>
              <Ionicons name="card-outline" size={22} color={colors.gold} />
              {Platform.OS === 'ios' && payload.applePayEnabled !== false ? (
                <Ionicons name="logo-apple" size={22} color="#fff" />
              ) : null}
            </View>
            <LiveRoomText style={s.paymentSheetIntroTitle}>Secure payment setup</LiveRoomText>
            <LiveRoomText style={s.paymentSheetIntroBody}>
              Tap Add payment method to open Stripe&apos;s secure sheet. Apple Pay appears automatically when
              your device and Stripe account support it.
            </LiveRoomText>
            {!sheetReady ? (
              <View style={s.loadingRow}>
                <ActivityIndicator color={colors.gold} />
                <LiveRoomText style={s.loadingText}>Preparing payment options…</LiveRoomText>
              </View>
            ) : null}
            <Pressable style={s.linkBtn} onPress={() => setMode('manual')}>
              <LiveRoomText style={s.linkBtnText}>Enter card manually instead</LiveRoomText>
            </Pressable>
          </View>
        ) : (
          <View style={s.cardFieldWrap}>
            <LiveRoomText style={s.cardFieldLabel}>Card details</LiveRoomText>
            <CardField
              postalCodeEnabled
              placeholders={WALLET_CARD_FIELD_PLACEHOLDERS}
              cardStyle={WALLET_CARD_FIELD_STYLE}
              style={s.cardFieldTall}
              onCardChange={(details) => setCardComplete(details.complete)}
            />
            {sheetReady ? (
              <Pressable style={s.linkBtn} onPress={() => setMode('paymentSheet')}>
                <LiveRoomText style={s.linkBtnText}>Use secure payment sheet instead</LiveRoomText>
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
      <View style={s.footer}>{footer}</View>
    </>
  );
}

export function WalletPaymentSetupStep(props: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<BuyerSetupIntentPayload | null>(null);

  useEffect(() => {
    if (!props.accessToken) {
      setError('Sign in to add a payment method.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const next = await createBuyerSetupIntent(props.accessToken);
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
  }, [props.accessToken]);

  if (loading) {
    return (
      <>
        <SheetHeader title="Add Payment Method" onBack={props.onBack} />
        <View style={s.loadingRow}>
          <ActivityIndicator color={colors.gold} />
          <LiveRoomText style={s.loadingText}>Preparing secure payment…</LiveRoomText>
        </View>
      </>
    );
  }

  if (error || !payload) {
    return (
      <>
        <SheetHeader title="Add Payment Method" onBack={props.onBack} />
        <LiveRoomText style={s.errorText}>{error ?? 'Could not start card setup.'}</LiveRoomText>
      </>
    );
  }

  return (
    <StripeProvider publishableKey={payload.publishableKey}>
      <WalletPaymentSetupInner {...props} payload={payload} />
    </StripeProvider>
  );
}
