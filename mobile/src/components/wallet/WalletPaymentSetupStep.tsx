import { Ionicons } from '@expo/vector-icons';
import {
  mapLivePaymentFailureMessage,
  recoveryStatusMessage,
} from '../../lib/livePaymentFailureCopy';
import {
  CardForm,
  PlatformPay,
  StripeProvider,
  usePlatformPay,
  useStripe,
} from '@stripe/stripe-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createBuyerSetupIntent,
  finalizeBuyerPaymentMethodSetup,
  FinalizePaymentMethodError,
  startBuyerVenmoSetup,
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
import { withLivePlaybackCommerceHold } from '../../lib/livePlaybackCommerceHold';
import { walletPaymentSetupStyles as ps } from './walletPaymentSetupStyles';
import {
  catalogEntryIcon,
  liveAcceptedWalletMethods,
  LIVE_PREMIUM_WALLET_TITLE,
} from '../../lib/livePremiumWallet';

const STRIPE_MERCHANT_IDENTIFIER = 'merchant.com.getvaulted.app';
const STRIPE_URL_SCHEME = 'getvaulted';
/** Matches app.json @stripe/stripe-react-native enableGooglePay. */
const NATIVE_GOOGLE_PAY_ENABLED = false;

/** CardForm inside a React Native Modal crashes on Android — use Stripe Payment Sheet instead. */
function useAndroidPaymentSheetForCard(): boolean {
  return Platform.OS === 'android';
}

const PAYMENT_SETUP_SUBTITLE = "You won't be charged until you win or buy.";

type Props = {
  visible: boolean;
  accessToken?: string;
  onClose: () => void;
  onSaved: (paymentMethodId?: string) => void;
  /** Skip method picker — open card form or native wallet immediately. */
  startWith?: 'picker' | 'card' | 'wallet';
  /** Render inside wallet sheet instead of a separate modal (fixes iPad). */
  embedded?: boolean;
};

/** Fixed header + scrollable body + sticky footer. */
function PaymentSetupScreenShell({
  onBack,
  backIcon = 'chevron-back',
  title,
  footer,
  children,
  keyboardAware = true,
}: {
  onBack: () => void;
  backIcon?: 'chevron-back' | 'close';
  title: string;
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
      <PaymentSetupHeader onBack={onBack} backIcon={backIcon} title={title} />
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

function PaymentSetupHeader({
  onBack,
  title,
  backIcon = 'chevron-back',
}: {
  onBack: () => void;
  title: string;
  backIcon?: 'chevron-back' | 'close';
}) {
  return (
    <View style={ps.headerBlock}>
      <View style={ps.headerRowDark}>
        <Pressable onPress={onBack} hitSlop={12} style={ps.headerBackBtn}>
          <Ionicons
            name={backIcon}
            size={backIcon === 'close' ? 22 : 24}
            color="rgba(255,255,255,0.75)"
          />
        </Pressable>
        <LiveRoomText style={ps.headerTitleDark}>{title}</LiveRoomText>
        <View style={ps.headerSpacer} />
      </View>
      <LiveRoomText style={ps.headerSubtitle}>{PAYMENT_SETUP_SUBTITLE}</LiveRoomText>
    </View>
  );
}

function TrustCopyBlock() {
  return (
    <View style={ps.trustBlock}>
      <View style={ps.trustRow}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.gold} />
        <LiveRoomText style={ps.trustTitle}>Saved securely with Stripe</LiveRoomText>
      </View>
      <LiveRoomText style={ps.trustBody}>
        Used for live bids, marketplace checkout, and auction wins.
      </LiveRoomText>
    </View>
  );
}

function methodPickerSubtitle(entryId: string): string {
  switch (entryId) {
    case 'apple_pay':
      return 'One-tap checkout on this device';
    case 'google_pay':
      return 'One-tap checkout on this device';
    case 'card':
      return 'Visa, Mastercard, Amex, and more';
    case 'cash_app_pay':
      return 'Pay with Cash App — saved for live wins';
    case 'venmo':
      return 'Pay with Venmo — saved for live wins';
    case 'link':
      return 'Stripe Link — fast checkout';
    case 'amazon_pay':
      return 'Pay with Amazon — saved for live';
    default:
      return 'Instant checkout for live & marketplace';
  }
}

function LivePaymentMethodPicker({
  payload,
  onClose,
  onPickCard,
  onPickWallet,
  onPickStripeSheet,
  onPickVenmo,
}: {
  payload: BuyerSetupIntentPayload;
  onClose: () => void;
  onPickCard: () => void;
  onPickWallet: () => void;
  onPickStripeSheet: () => void;
  onPickVenmo: () => void;
}) {
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  const capabilities = {
    link: payload.linkEnabled === true,
    cashAppPay: payload.cashAppPayEnabled === true,
    amazonPay: payload.amazonPayEnabled === true,
    paypal: payload.paypalEnabled === true,
    venmo: payload.venmoEnabled !== false,
  };
  const methods = liveAcceptedWalletMethods(platform, capabilities)
    .filter((entry) => {
      if (entry.id === 'google_pay' && platform === 'android' && !NATIVE_GOOGLE_PAY_ENABLED) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.id === 'apple_pay' || a.id === 'google_pay') return -1;
      if (b.id === 'apple_pay' || b.id === 'google_pay') return 1;
      return 0;
    });

  return (
    <View style={ps.body}>
      <PaymentSetupHeader onBack={onClose} backIcon="close" title="Add payment method" />
      <ScrollView
        contentContainerStyle={ps.pickerScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LiveRoomText style={ps.sectionLabel}>Choose a method</LiveRoomText>
        {methods.map((entry) => {
          const onPress =
            entry.id === 'card'
              ? onPickCard
              : entry.id === 'apple_pay' || entry.id === 'google_pay'
                ? onPickWallet
                : entry.id === 'venmo'
                  ? onPickVenmo
                  : onPickStripeSheet;
          const showFastestBadge =
            (entry.id === 'apple_pay' && platform === 'ios' && payload.applePayEnabled !== false) ||
            (entry.id === 'google_pay' && platform === 'android' && NATIVE_GOOGLE_PAY_ENABLED);
          return (
            <Pressable
              key={entry.id}
              style={({ pressed }) => [ps.methodCard, pressed && ps.methodCardPressed]}
              onPress={onPress}
            >
              <View style={ps.methodIconWrap}>
                <Ionicons name={catalogEntryIcon(entry.id)} size={22} color={colors.gold} />
              </View>
              <View style={ps.methodTextBlock}>
                <LiveRoomText style={ps.methodTitle}>{entry.label}</LiveRoomText>
                <LiveRoomText style={ps.methodSub}>{methodPickerSubtitle(entry.id)}</LiveRoomText>
              </View>
              {showFastestBadge ? (
                <View style={ps.methodBadge}>
                  <LiveRoomText style={ps.methodBadgeText}>Fastest</LiveRoomText>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.28)" />
            </Pressable>
          );
        })}
        <TrustCopyBlock />
      </ScrollView>
    </View>
  );
}

function ManualCardEntry({
  initError,
  busy,
  saveSuccess,
  onBack,
  onSave,
  stripeNativeReady,
}: {
  initError: string | null;
  busy: boolean;
  saveSuccess: boolean;
  onBack: () => void;
  onSave: () => void;
  stripeNativeReady: boolean;
}) {
  const [cardComplete, setCardComplete] = useState(false);
  const canSave = cardComplete && !busy && !saveSuccess;

  return (
    <PaymentSetupScreenShell
      onBack={onBack}
      title="Add card"
      footer={
        <Pressable
          style={[
            ps.primaryBtn,
            saveSuccess && ps.primaryBtnSuccess,
            !canSave && !saveSuccess && ps.primaryBtnDisabled,
          ]}
          onPress={onSave}
          disabled={!canSave}
        >
          {busy ? (
            <>
              <ActivityIndicator color="#111111" size="small" />
              <LiveRoomText style={ps.primaryBtnText}>Saving…</LiveRoomText>
            </>
          ) : saveSuccess ? (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#6ee7b7" />
              <LiveRoomText style={[ps.primaryBtnText, ps.primaryBtnTextSuccess]}>
                Card added successfully
              </LiveRoomText>
            </>
          ) : (
            <LiveRoomText
              style={[ps.primaryBtnText, !canSave && ps.primaryBtnTextDisabled]}
            >
              Save card
            </LiveRoomText>
          )}
        </Pressable>
      }
    >
      {saveSuccess ? (
        <View style={ps.successBanner}>
          <Ionicons name="checkmark-circle" size={22} color="#6ee7b7" />
          <LiveRoomText style={ps.successBannerText}>Card added successfully</LiveRoomText>
        </View>
      ) : null}

      <View style={ps.cardEntrySection}>
        <LiveRoomText style={ps.sectionLabel}>Card details</LiveRoomText>
        <View style={ps.stripeCardShell}>
          <View style={ps.stripeCardInner}>
            {stripeNativeReady ? (
              <CardForm
                autofocus={false}
                placeholders={WALLET_CARD_FIELD_PLACEHOLDERS}
                cardStyle={WALLET_CARD_FORM_STYLE}
                defaultValues={{ countryCode: 'US' }}
                style={ps.cardForm}
                onFormComplete={(details) => setCardComplete(details.complete)}
              />
            ) : (
              <View style={ps.cardFormLoading}>
                <ActivityIndicator color="#71717A" />
              </View>
            )}
          </View>
        </View>
        {initError ? <LiveRoomText style={ps.errorText}>{initError}</LiveRoomText> : null}
      </View>

      <TrustCopyBlock />
    </PaymentSetupScreenShell>
  );
}

function WalletPaymentSetupInner({
  accessToken,
  onClose,
  onSaved,
  payload,
  stripeNativeReady,
  startWith = 'picker',
}: {
  accessToken?: string;
  onClose: () => void;
  onSaved: (paymentMethodId?: string) => void;
  payload: BuyerSetupIntentPayload;
  stripeNativeReady: boolean;
  startWith?: 'picker' | 'card' | 'wallet';
}) {
  const androidPaymentSheet = useAndroidPaymentSheetForCard();
  const { confirmSetupIntent, retrieveSetupIntent, initPaymentSheet, presentPaymentSheet } = useStripe();
  const { confirmPlatformPaySetupIntent } = usePlatformPay();
  const [useManualCard, setUseManualCard] = useState(startWith === 'card' && !androidPaymentSheet);
  const [showPicker, setShowPicker] = useState(
    startWith === 'picker' || (startWith === 'wallet' && androidPaymentSheet && !NATIVE_GOOGLE_PAY_ENABLED),
  );
  const [initError, setInitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const saveSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [androidSheetOpening, setAndroidSheetOpening] = useState(
    startWith === 'card' && androidPaymentSheet,
  );
  const walletAutoPresentRef = useRef(
    startWith === 'wallet' && !(androidPaymentSheet && !NATIVE_GOOGLE_PAY_ENABLED),
  );
  const androidCardSheetAutoRef = useRef(startWith === 'card' && androidPaymentSheet);

  useEffect(() => {
    return () => {
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current);
    };
  }, []);

  const finishSaved = useCallback(
    (paymentMethodId: string) => {
      setSaveSuccess(true);
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current);
      saveSuccessTimerRef.current = setTimeout(() => {
        onSaved(paymentMethodId);
      }, 1400);
    },
    [onSaved],
  );

  const backToPicker = useCallback(() => {
    if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current);
    setSaveSuccess(false);
    setUseManualCard(false);
    setShowPicker(true);
    setInitError(null);
  }, []);

  const completeSavedPaymentMethod = useCallback(async (
    paymentMethodId?: string | null,
    options?: { animateSuccess?: boolean },
  ) => {
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
    if (options?.animateSuccess) {
      finishSaved(finalizedPaymentMethodId);
      return;
    }
    onSaved(finalizedPaymentMethodId);
  }, [accessToken, finishSaved, onSaved, payload.clientSecret]);

  /** PaymentSheet for card (Android) and redirect wallets (Cash App, Link, Amazon Pay). */
  const presentStripePaymentSheet = useCallback(async (): Promise<'saved' | 'cancelled' | 'failed'> => {
    if (busy) return 'failed';
    setBusy(true);
    setInitError(null);
    setAndroidSheetOpening(true);
    try {
      return await withLivePlaybackCommerceHold(async () => {
        const { error: initSheetError } = await initPaymentSheet({
          merchantDisplayName: LIVE_PREMIUM_WALLET_TITLE,
          setupIntentClientSecret: payload.clientSecret,
          returnURL: `${STRIPE_URL_SCHEME}://stripe-redirect`,
          allowsDelayedPaymentMethods: false,
        });
        if (initSheetError) {
          setInitError(mapLivePaymentFailureMessage(initSheetError.message, initSheetError.code));
          return 'failed';
        }
        const { error: presentError } = await presentPaymentSheet();
        if (presentError) {
          if (presentError.code === 'Canceled') return 'cancelled';
          setInitError(mapLivePaymentFailureMessage(presentError.message, presentError.code));
          return 'failed';
        }
        const retrieved = await retrieveSetupIntent(payload.clientSecret);
        if (retrieved.error) {
          setInitError(mapLivePaymentFailureMessage(retrieved.error.message, retrieved.error.code));
          return 'failed';
        }
        const paymentMethodId = paymentMethodIdFromSetupIntent(retrieved.setupIntent);
        await completeSavedPaymentMethod(paymentMethodId);
        return 'saved';
      });
    } finally {
      setBusy(false);
      setAndroidSheetOpening(false);
    }
  }, [
    busy,
    completeSavedPaymentMethod,
    initPaymentSheet,
    payload.clientSecret,
    presentPaymentSheet,
    retrieveSetupIntent,
  ]);

  const confirmNativeWalletSetup = useCallback(async (): Promise<
    { outcome: 'saved'; paymentMethodId: string } | { outcome: 'cancelled' | 'failed' }
  > => {
    if (busy) return { outcome: 'failed' };
    setBusy(true);
    setInitError(null);
    try {
      return await withLivePlaybackCommerceHold(async () => {
        const { error, setupIntent } = await confirmPlatformPaySetupIntent(payload.clientSecret, {
          applePay:
            Platform.OS === 'ios' && payload.applePayEnabled !== false
              ? {
                  merchantCountryCode: payload.merchantCountryCode ?? 'US',
                  currencyCode: 'USD',
                  cartItems: [
                    {
                      label: 'Save payment method',
                      amount: '0.00',
                      paymentType: PlatformPay.PaymentType.Immediate,
                    },
                  ],
                }
              : undefined,
          googlePay:
            Platform.OS === 'android' &&
            NATIVE_GOOGLE_PAY_ENABLED &&
            payload.googlePayEnabled !== false
              ? {
                  merchantCountryCode: payload.merchantCountryCode ?? 'US',
                  currencyCode: 'USD',
                  testEnv: __DEV__,
                }
              : undefined,
        });
        if (error) {
          if (error.code === 'Canceled') return { outcome: 'cancelled' as const };
          setInitError(mapLivePaymentFailureMessage(error.message, error.code));
          return { outcome: 'failed' as const };
        }
        const paymentMethodId = paymentMethodIdFromSetupIntent(setupIntent);
        if (!paymentMethodId) {
          setInitError('Could not read saved wallet details. Try again.');
          return { outcome: 'failed' as const };
        }
        return { outcome: 'saved' as const, paymentMethodId };
      });
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    confirmPlatformPaySetupIntent,
    payload.applePayEnabled,
    payload.clientSecret,
    payload.googlePayEnabled,
    payload.merchantCountryCode,
  ]);

  useEffect(() => {
    setInitError(null);
    setBusy(false);
    setSaveSuccess(false);
    if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current);
    setUseManualCard(startWith === 'card' && !androidPaymentSheet);
    const walletUnavailableOnAndroid = androidPaymentSheet && !NATIVE_GOOGLE_PAY_ENABLED;
    setShowPicker(startWith === 'picker' || (startWith === 'wallet' && walletUnavailableOnAndroid));
    setAndroidSheetOpening(startWith === 'card' && androidPaymentSheet);
    walletAutoPresentRef.current = startWith === 'wallet' && !walletUnavailableOnAndroid;
    androidCardSheetAutoRef.current = startWith === 'card' && androidPaymentSheet;
  }, [androidPaymentSheet, payload.clientSecret, startWith]);

  useEffect(() => {
    if (!androidCardSheetAutoRef.current || busy) return;
    androidCardSheetAutoRef.current = false;
    void (async () => {
      const result = await presentStripePaymentSheet();
      if (result === 'cancelled') onClose();
      if (result === 'failed') setShowPicker(true);
    })();
  }, [busy, onClose, presentStripePaymentSheet]);

  useEffect(() => {
    if (!walletAutoPresentRef.current || busy || useManualCard || showPicker) return;
    walletAutoPresentRef.current = false;
    void (async () => {
      const result = await confirmNativeWalletSetup();
      if (result.outcome === 'saved') {
        await completeSavedPaymentMethod(result.paymentMethodId);
        return;
      }
      if (result.outcome === 'cancelled') {
        onClose();
        return;
      }
      setShowPicker(true);
    })();
  }, [busy, useManualCard, showPicker, confirmNativeWalletSetup, completeSavedPaymentMethod, onClose]);

  const openNativeWallet = useCallback(() => {
    if (busy) return;
    setInitError(null);
    setShowPicker(false);
    void (async () => {
      const result = await confirmNativeWalletSetup();
      if (result.outcome === 'saved') {
        await completeSavedPaymentMethod(result.paymentMethodId);
        return;
      }
      if (result.outcome === 'cancelled') return;
      setShowPicker(true);
    })();
  }, [busy, confirmNativeWalletSetup, completeSavedPaymentMethod]);

  const openManualCard = useCallback(() => {
    setInitError(null);
    setShowPicker(false);
    if (androidPaymentSheet) {
      void (async () => {
        const result = await presentStripePaymentSheet();
        if (result === 'cancelled') setShowPicker(true);
        if (result === 'failed') setShowPicker(true);
      })();
      return;
    }
    setUseManualCard(true);
  }, [androidPaymentSheet, presentStripePaymentSheet]);

  const openStripeWalletSheet = useCallback(() => {
    if (busy) return;
    setInitError(null);
    setShowPicker(false);
    void (async () => {
      const result = await presentStripePaymentSheet();
      if (result === 'cancelled' || result === 'failed') setShowPicker(true);
    })();
  }, [busy, presentStripePaymentSheet]);

  const openVenmoSetup = useCallback(() => {
    if (busy) return;
    setInitError(null);
    void (async () => {
      setBusy(true);
      try {
        const result = await startBuyerVenmoSetup(accessToken);
        if (result.authorizeUrl) {
          await Linking.openURL(result.authorizeUrl);
          return;
        }
        if (result.paymentMethodId?.startsWith('pm_') || result.paymentMethodId) {
          onSaved(result.paymentMethodId);
          return;
        }
        Alert.alert('Venmo', 'Venmo linking did not return a next step. Try again later.');
      } catch (e) {
        const msg =
          e instanceof Error && e.message.trim()
            ? e.message
            : 'Could not start Venmo linking. Try again, or connect Venmo on the website wallet for a clearer error.';
        Alert.alert('Venmo', msg);
      } finally {
        setBusy(false);
      }
    })();
  }, [accessToken, busy, onSaved]);

  const saveManualCard = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await withLivePlaybackCommerceHold(async () => {
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
        await completeSavedPaymentMethod(paymentMethodId, { animateSuccess: true });
      });
    } finally {
      setBusy(false);
    }
  };

  if (useManualCard) {
    return (
      <ManualCardEntry
        initError={initError}
        busy={busy}
        saveSuccess={saveSuccess}
        onBack={backToPicker}
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
        onPickCard={openManualCard}
        onPickWallet={openNativeWallet}
        onPickStripeSheet={openStripeWalletSheet}
        onPickVenmo={openVenmoSetup}
      />
    );
  }

  if (!useManualCard && !showPicker) {
    return (
      <View style={ps.loadingBlock}>
        <ActivityIndicator color={colors.gold} size="large" />
        <LiveRoomText style={ps.loadingText}>
          {androidSheetOpening ? 'Opening secure payment…' : 'Opening Apple Pay…'}
        </LiveRoomText>
      </View>
    );
  }

  return null;
}

function PaymentSetupLoader({ onClose }: { onClose: () => void }) {
  return (
    <View style={ps.body}>
      <PaymentSetupHeader onBack={onClose} backIcon="close" title="Add payment method" />
      <View style={ps.loadingBlock}>
        <ActivityIndicator color={colors.gold} size="large" />
        <LiveRoomText style={ps.loadingText}>Preparing secure payment…</LiveRoomText>
      </View>
    </View>
  );
}

function WalletPaymentSetupBody({
  active,
  accessToken,
  onClose,
  onSaved,
  startWith = 'picker',
  embedded = false,
}: Omit<Props, 'visible'> & { active: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<BuyerSetupIntentPayload | null>(null);
  const stripeNativeReady = usePaymentFormLightAppearance(active);

  useEffect(() => {
    if (!active) {
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
  }, [active, accessToken, startWith]);

  if (!active) return null;

  const shellStyle = embedded ? ps.embeddedShell : ps.panelShell;
  const panelStyle = embedded ? ps.embeddedPanel : ps.panelDark;

  return (
    <View style={shellStyle}>
      {/* Embedded (Vault Wallet sheet) already has bottom safe padding from the parent. */}
      <SafeAreaView style={panelStyle} edges={embedded ? [] : ['top']}>
        {loading ? (
          <PaymentSetupLoader onClose={onClose} />
        ) : error || !payload ? (
          <View style={ps.body}>
            <PaymentSetupHeader onBack={onClose} backIcon="close" title="Add payment method" />
            <View style={ps.errorStateBlock}>
              <Ionicons name="alert-circle-outline" size={36} color="#fca5a5" />
              <LiveRoomText style={ps.errorStateTitle}>Could not start card setup</LiveRoomText>
              <LiveRoomText style={ps.errorText}>
                {error ?? 'Something went wrong. Try again in a moment.'}
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
              key={`${payload.clientSecret}:${startWith}`}
              accessToken={accessToken}
              onClose={onClose}
              onSaved={onSaved}
              payload={payload}
              stripeNativeReady={stripeNativeReady}
              startWith={startWith}
            />
          </StripeProvider>
        )}
      </SafeAreaView>
    </View>
  );
}

/** Inline payment setup for Vault Wallet — avoids stacked modals on iPad. */
export function WalletPaymentSetupPanel(
  props: Omit<Props, 'visible'> & { active: boolean },
) {
  return <WalletPaymentSetupBody {...props} embedded />;
}

/** Full-screen add-card flow over a dimmed live room — separate from the wallet bottom sheet. */
export function WalletPaymentSetupModal({
  visible,
  accessToken,
  onClose,
  onSaved,
  startWith = 'picker',
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={ps.backdrop}>
        <WalletPaymentSetupBody
          active={visible}
          accessToken={accessToken}
          onClose={onClose}
          onSaved={onSaved}
          startWith={startWith}
        />
      </View>
    </Modal>
  );
}

/** @deprecated Use WalletPaymentSetupModal */
export const WalletPaymentSetupStep = WalletPaymentSetupModal;
