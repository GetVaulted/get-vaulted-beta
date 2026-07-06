import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { patchSellerProfile, patchSellerShipFrom } from '../../api/sellerAccountRepository';
import { uploadMyAvatar } from '../../api/profilesRepository';
import { persistProfileAvatarEverywhere } from '../../lib/profileAvatarSync';
import { useAuth } from '../../auth/AuthContext';
import { useSellerSetupState } from '../../hooks/useSellerSetupState';
import { reconcileSellerPayoutAfterStripe } from '../../lib/reconcileSellerPayoutAfterStripe';
import {
  isWizardPayoutStepComplete,
  payoutReconcileMessage,
  sellerShouldContinueStripeOnboarding,
} from '../../lib/seller-stripe-connect-status';
import {
  resolveSellerWizardStep,
  SELLER_WIZARD_TOTAL_STEPS,
  WIZARD_STEP_LABELS,
  type SellerWizardStep,
} from '../../lib/seller-setup-wizard';
import {
  clearSellerWizardComplete,
  markSellerWizardCompleteLocal,
} from '../../lib/sellerWizardStorage';
import { markSellerSetupWizardCompleteOnServer } from '../../api/sellerAccountRepository';
import {
  SELLER_SHIP_FROM_COUNTRY,
  SELLER_SHIP_FROM_COUNTRY_LABEL,
  sellerHasShipFromAddress,
} from '../../lib/seller-shipping-readiness';
import { openStripeConnectOnboarding } from '../../lib/openStripeConnectOnboarding';
import { useSellerStripeConnect } from '../../hooks/useSellerStripeConnect';
import { openSellerHQ } from '../../navigation/openSellerHQ';
import { AddressAutocompleteFields } from '../../components/address/AddressAutocompleteFields';
import type { RootStackParamList } from '../../navigation/types';
import { siteUrls } from '../../lib/siteUrls';
import { colors, radii, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerSetupWizard'>;

export function SellerSetupWizardScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, session } = useAuth();
  const token = session?.access_token;
  const setup = useSellerSetupState(token, user?.id, Boolean(user?.id));
  const stripeConnect = useSellerStripeConnect(token);

  const [step, setStep] = useState<SellerWizardStep>(1);
  const [stepReady, setStepReady] = useState(false);
  const stepInitRef = useRef(false);
  const wizardScrollRef = useRef<ScrollView | null>(null);

  const [shipName, setShipName] = useState('');
  const [shipStreet, setShipStreet] = useState('');
  const [shipCity, setShipCity] = useState('');
  const [shipState, setShipState] = useState('');
  const [shipZip, setShipZip] = useState('');
  const [shipPhone, setShipPhone] = useState('');
  const [shippingSaved, setShippingSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [finishBusy, setFinishBusy] = useState(false);
  const [sellerAgreementAccepted, setSellerAgreementAccepted] = useState(false);

  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutReconciling, setPayoutReconciling] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutNotice, setPayoutNotice] = useState<string | null>(null);
  const [payoutContinueStripe, setPayoutContinueStripe] = useState(false);
  const [startSetupBusy, setStartSetupBusy] = useState(false);
  const stripeReturnRef = useRef(false);
  const stripeReturnClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconcileInFlightRef = useRef(false);
  const reconcileAbortRef = useRef(false);

  const markStripeReturnPending = useCallback(() => {
    stripeReturnRef.current = true;
    if (stripeReturnClearTimerRef.current) clearTimeout(stripeReturnClearTimerRef.current);
    stripeReturnClearTimerRef.current = setTimeout(() => {
      stripeReturnRef.current = false;
    }, 120_000);
  }, []);

  const clearStripeReturnPending = useCallback(() => {
    stripeReturnRef.current = false;
    if (stripeReturnClearTimerRef.current) {
      clearTimeout(stripeReturnClearTimerRef.current);
      stripeReturnClearTimerRef.current = null;
    }
  }, []);

  const reconcilePayoutState = useCallback(
    async (opts?: { autoAdvance?: boolean }) => {
      if (!token || reconcileInFlightRef.current) return false;
      reconcileInFlightRef.current = true;
      reconcileAbortRef.current = false;
      setPayoutReconciling(true);
      setPayoutError(null);
      setPayoutNotice(null);
      setPayoutContinueStripe(false);
      if (__DEV__) console.log('[seller-setup] reconcile payout start');
      try {
        const result = await reconcileSellerPayoutAfterStripe(token, {
          shouldAbort: () => reconcileAbortRef.current,
        });
        await Promise.all([setup.refetchSilent(), stripeConnect.refresh()]);
        if (result.complete && opts?.autoAdvance !== false) {
          setPayoutContinueStripe(false);
          clearStripeReturnPending();
          setStep((current) => (current === 2 ? 3 : current));
          return true;
        }
        if (!reconcileAbortRef.current) {
          const needsStripe = sellerShouldContinueStripeOnboarding(result.connect, result.checks);
          setPayoutContinueStripe(needsStripe);
          const message = payoutReconcileMessage(result.uiState, result.connect, result.connectError);
          if (result.uiState === 'status_unavailable') {
            setPayoutNotice(null);
            setPayoutError(message);
          } else {
            setPayoutError(null);
            setPayoutNotice(message || null);
          }
        }
        return result.complete;
      } finally {
        reconcileInFlightRef.current = false;
        setPayoutReconciling(false);
        if (__DEV__) console.log('[seller-setup] reconcile payout end');
      }
    },
    [token, setup, stripeConnect, clearStripeReturnPending],
  );

  useEffect(() => {
    return () => {
      if (stripeReturnClearTimerRef.current) clearTimeout(stripeReturnClearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (step === 2) stripeReturnRef.current = false;
  }, [step]);

  useEffect(() => {
    if (!token) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (
        next === 'active' &&
        step === 2 &&
        stripeReturnRef.current &&
        !payoutBusy &&
        !reconcileInFlightRef.current
      ) {
        void reconcilePayoutState({ autoAdvance: true });
      }
    });
    return () => sub.remove();
  }, [token, step, payoutBusy, reconcilePayoutState]);

  useEffect(() => {
    if (!setup.seller) return;
    setShipName(setup.seller.shipFromName ?? '');
    setShipStreet(setup.seller.shipFromStreet ?? '');
    setShipCity(setup.seller.shipFromCity ?? '');
    setShipState(setup.seller.shipFromState ?? '');
    setShipZip(setup.seller.shipFromZip ?? '');
    setShipPhone(setup.seller.shipFromPhone ?? '');
    setDisplayName(setup.seller.name ?? '');
    setProfileImage(setup.seller.image);
    setShippingSaved(sellerHasShipFromAddress(setup.checks, setup.seller));
  }, [setup.seller, setup.checks]);

  useEffect(() => {
    if (setup.phase === 'loading' || !setup.checks || stepInitRef.current) return;
    stepInitRef.current = true;
    const agreementAccepted = Boolean(setup.sellerAgreementAcceptedAt);
    const wizardComplete =
      Boolean(setup.sellerSetupWizardCompletedAt) && agreementAccepted && setup.wizardComplete;
    if (agreementAccepted) setSellerAgreementAccepted(true);
    setStep(
      resolveSellerWizardStep({
        checks: setup.checks,
        wizardComplete,
        sellerAgreementAccepted: agreementAccepted,
      }),
    );
    setStepReady(true);
  }, [
    setup.phase,
    setup.checks,
    setup.sellerSetupWizardCompletedAt,
    setup.sellerAgreementAcceptedAt,
    setup.wizardComplete,
  ]);

  const goBack = useCallback(() => {
    if (step === 2) {
      setStep(1);
      return;
    }
    if (step === 3) {
      setShippingSaved(false);
      setStep(2);
      return;
    }
    if (step === 4) {
      setStep(3);
      return;
    }
    if (step === 5) {
      void clearSellerWizardComplete(user?.id).then(() => {
        setup.setWizardCompleteLocal(false);
        setStep(4);
      });
    }
  }, [step, setup, user?.id]);

  const openPayouts = async () => {
    if (!token || payoutBusy || payoutReconciling) return;
    setPayoutBusy(true);
    setPayoutError(null);
    setPayoutNotice(null);
    setPayoutContinueStripe(false);
    clearStripeReturnPending();
    try {
      markStripeReturnPending();
      await openStripeConnectOnboarding(token);
      await reconcilePayoutState({ autoAdvance: true });
    } catch (e) {
      clearStripeReturnPending();
      const msg = e instanceof Error ? e.message : 'Could not open Stripe setup.';
      setPayoutError(msg);
      setPayoutNotice(null);
      console.warn('[seller-setup] open payouts failed', msg);
    } finally {
      setPayoutBusy(false);
    }
  };

  const cancelPayoutReconcile = () => {
    reconcileAbortRef.current = true;
    setPayoutReconciling(false);
    setPayoutNotice('Payout confirmation cancelled. Tap Connect payouts or Retry status check when ready.');
    setPayoutError(null);
  };

  const saveShipping = async () => {
    if (!token) return;
    const required = [shipStreet, shipCity, shipState, shipZip, shipPhone].map((v) => v.trim());
    if (required.some((v) => !v)) {
      Alert.alert('Complete your address', 'Street, city, state, ZIP, and contact phone are required.');
      return;
    }
    setSaveBusy(true);
    try {
      const res = await patchSellerShipFrom(token, {
        shipFromName: shipName.trim() || undefined,
        shipFromStreet: shipStreet.trim(),
        shipFromCity: shipCity.trim(),
        shipFromState: shipState.trim(),
        shipFromZip: shipZip.trim(),
        shipFromCountry: SELLER_SHIP_FROM_COUNTRY,
        shipFromPhone: shipPhone.trim(),
      });
      if (res.readiness) {
        setup.applyReadinessFromServer(res.readiness, res.seller);
      } else {
        await setup.refetchSilent();
      }
      setShippingSaved(true);
      setStep(4);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaveBusy(false);
    }
  };

  const pickPhoto = async () => {
    if (!user?.id) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos', 'Allow photo library access to add a profile photo.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    try {
      const url = await uploadMyAvatar(user.id, asset.uri, asset.mimeType ?? 'image/jpeg');
      await persistProfileAvatarEverywhere({ userId: user.id, accessToken: token, publicUrl: url });
      setProfileImage(url);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not upload photo.');
    }
  };

  const finishWizard = async () => {
    if (!sellerAgreementAccepted) {
      Alert.alert('Seller agreement', 'Accept the seller agreement before finishing setup.');
      return;
    }
    if (!token) {
      Alert.alert('Sign in required', 'Sign in again to finish seller setup.');
      return;
    }
    setFinishBusy(true);
    try {
      await markSellerSetupWizardCompleteOnServer(token, true);
      await markSellerWizardCompleteLocal(user?.id);
      setup.setWizardCompleteLocal(true);
      await setup.refetchSilent();
      setStep(5);
    } catch (e) {
      Alert.alert('Could not finish setup', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setFinishBusy(false);
    }
  };

  const saveProfile = async () => {
    if (!token) return;
    setProfileBusy(true);
    try {
      const body: { name?: string; image?: string } = {};
      if (displayName.trim()) body.name = displayName.trim();
      if (profileImage) body.image = profileImage;
      if (Object.keys(body).length) await patchSellerProfile(token, body);
      await finishWizard();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setProfileBusy(false);
    }
  };

  const enterHq = () => {
    void setup.refetchSilent();
    navigation.goBack();
    openSellerHQ();
  };

  if (!user) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.muted}>Sign in to start seller setup.</Text>
      </View>
    );
  }

  const wizardDataLoading = setup.phase === 'loading' || !stepReady;

  const checks = setup.checks;
  const payoutsDone = isWizardPayoutStepComplete(checks, stripeConnect.status);
  const progressPct = Math.round((step / SELLER_WIZARD_TOTAL_STEPS) * 100);
  const payoutStepLoading = payoutBusy || payoutReconciling;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityLabel="Close setup">
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.eyebrow}>Seller onboarding</Text>
          <Text style={styles.stepMeta}>
            Step {step} of {SELLER_WIZARD_TOTAL_STEPS} · {WIZARD_STEP_LABELS[step]}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView ref={wizardScrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {step === 1 ? (
            <>
              <Text style={styles.eyebrowInline}>Sell on Get Vaulted</Text>
              <Text style={styles.title}>Why sell here</Text>
              <Text style={styles.body}>
                The premium live collectible marketplace — lower fees, real-time auctions, and tools built for breakers
                and shops.
              </Text>
              {[
                ['Lower seller fees', 'Keep more on marketplace and live sales'],
                ['Live auctions & breaks', 'Sell in the room with real-time bidding'],
                ['Marketplace + vault', 'List buy-now inventory beside your shows'],
                ['OBS & mobile streaming', 'Broadcast from phone or pipe in OBS'],
                ['Seller growth', 'Seller HQ tracks revenue, fulfillment, and shows'],
              ].map(([label, desc]) => (
                <View key={label} style={styles.unlockRow}>
                  <Text style={styles.unlockTitle}>{label}</Text>
                  <Text style={styles.unlockDesc}>{desc}</Text>
                </View>
              ))}
              <Text style={styles.sectionLabel}>What you unlock next</Text>
              {[
                ['Listings', 'Buy-now and auction inventory'],
                ['Live selling', 'Host shows and run breaks'],
                ['Payouts', 'Stripe-powered seller payouts'],
                ['Seller HQ', 'Command center for sales'],
              ].map(([label, desc]) => (
                <View key={label} style={styles.unlockRow}>
                  <Text style={styles.unlockTitle}>{label}</Text>
                  <Text style={styles.unlockDesc}>{desc}</Text>
                </View>
              ))}
              <Text style={styles.hint}>Setup takes about 2 minutes — payout, ship-from, profile.</Text>
              <PrimaryButton
                label={startSetupBusy ? 'Starting…' : 'Start seller setup'}
                disabled={startSetupBusy}
                onPress={() => {
                  setStartSetupBusy(true);
                  setStep(2);
                  setStartSetupBusy(false);
                }}
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text style={styles.title}>Payout setup</Text>
              <Text style={styles.body}>
                Connect Stripe once to receive marketplace and live-sale payouts. Listing and going live unlock after
                payout setup is complete.
              </Text>
              {[
                ['Why Stripe', 'Verifies identity and links your payout destination securely.'],
                ['How payouts work', 'Earnings appear in Seller HQ and pay out on Stripe’s schedule after sales clear.'],
                ['Instant payouts', 'May be available after delivery confirmation and good standing.'],
                ['Limits', 'Disputes, chargebacks, fraud, or policy issues can delay instant payouts.'],
              ].map(([label, desc]) => (
                <View key={label} style={styles.infoRow}>
                  <Text style={styles.unlockTitle}>{label}</Text>
                  <Text style={styles.unlockDesc}>{desc}</Text>
                </View>
              ))}
              {payoutStepLoading ? (
                <View style={styles.reconcileBox}>
                  <ActivityIndicator color={colors.gold} />
                  <Text style={styles.reconcileText}>Confirming payout setup…</Text>
                  <Pressable onPress={cancelPayoutReconcile} hitSlop={8}>
                    <Text style={styles.link}>Cancel</Text>
                  </Pressable>
                </View>
              ) : payoutsDone ? (
                <View style={styles.successBox}>
                  <Text style={styles.successIcon}>✓</Text>
                  <Text style={styles.successTitle}>Payouts connected</Text>
                  <Text style={styles.successSub}>Stripe is linked and ready for seller payouts.</Text>
                </View>
              ) : (
                <View style={styles.dashedBox}>
                  <Text style={styles.body}>
                    Stripe collects tax, identity, and bank details. Get Vaulted never stores your full banking
                    credentials.
                  </Text>
                </View>
              )}
              {payoutNotice ? (
                <View style={styles.noticeBox}>
                  <Text style={styles.noticeText}>{payoutNotice}</Text>
                  <View style={styles.errorActions}>
                    {payoutContinueStripe ? (
                      <Pressable onPress={() => void openPayouts()} hitSlop={8} disabled={payoutStepLoading}>
                        <Text style={styles.link}>Continue Stripe setup</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => void reconcilePayoutState({ autoAdvance: true })}
                      hitSlop={8}
                      disabled={payoutStepLoading}
                    >
                      <Text style={styles.link}>Retry status check</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              {payoutError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{payoutError}</Text>
                </View>
              ) : null}
              <StepActions
                showBack
                onBack={goBack}
                primaryLabel={
                  payoutStepLoading
                    ? 'Confirming…'
                    : payoutsDone
                      ? 'Continue'
                      : payoutBusy
                        ? 'Opening…'
                        : payoutContinueStripe
                          ? 'Continue Stripe setup'
                          : 'Connect payouts'
                }
                onPrimary={() => {
                  if (payoutsDone) {
                    setStep(3);
                    return;
                  }
                  void openPayouts();
                }}
                primaryDisabled={payoutStepLoading || (!setup.stripePlatformConfigured && !payoutsDone)}
              />
            </>
          ) : null}

          {wizardDataLoading && step === 1 ? (
            <View style={styles.inlineLoader}>
              <ActivityIndicator color={colors.gold} size="small" />
              <Text style={styles.hint}>Loading your seller status…</Text>
            </View>
          ) : null}

          {step === 3 ? (
            <>
              <Text style={styles.title}>Shipping address</Text>
              <Text style={styles.body}>
                Where packages ship from when you fulfill orders. We use this for shipping labels and buyer estimates.
              </Text>
              {shippingSaved ? (
                <>
                  <View style={styles.successBox}>
                    <Text style={styles.successIcon}>✓</Text>
                    <Text style={styles.successTitle}>Address saved</Text>
                    <Text style={styles.successSub}>
                      {[shipStreet, shipCity, shipState, shipZip, SELLER_SHIP_FROM_COUNTRY].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                  <StepActions showBack onBack={goBack} primaryLabel="Continue" onPrimary={() => setStep(4)} />
                </>
              ) : (
                <>
                  <Field label="Name / company" value={shipName} onChangeText={setShipName} />
                  <Field
                    label="Contact phone (required for USPS labels)"
                    value={shipPhone}
                    onChangeText={setShipPhone}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                  />
                  <AddressAutocompleteFields
                    accessToken={token}
                    scrollViewRef={wizardScrollRef}
                    values={{
                      line1: shipStreet,
                      line2: '',
                      city: shipCity,
                      state: shipState,
                      postalCode: shipZip,
                      country: SELLER_SHIP_FROM_COUNTRY,
                    }}
                    onChange={(field, value) => {
                      if (field === 'line1') setShipStreet(value);
                      if (field === 'city') setShipCity(value);
                      if (field === 'state') setShipState(value);
                      if (field === 'postalCode') setShipZip(value);
                    }}
                    onResolved={(resolved) => {
                      setShipStreet(resolved.line2 ? `${resolved.line1} ${resolved.line2}`.trim() : resolved.line1);
                      setShipCity(resolved.city);
                      setShipState(resolved.state);
                      setShipZip(resolved.postalCode);
                    }}
                    line1Label="Street"
                    showLine2={false}
                    showCountry
                    countryReadOnly
                    inputStyle={styles.input}
                    labelStyle={styles.fieldLabel}
                  />
                  <Text style={styles.fieldHint}>US-only selling during launch ({SELLER_SHIP_FROM_COUNTRY_LABEL}).</Text>
                  <StepActions
                    showBack
                    onBack={goBack}
                    primaryLabel={saveBusy ? 'Saving…' : 'Save & continue'}
                    onPrimary={() => void saveShipping()}
                    primaryDisabled={saveBusy}
                  />
                </>
              )}
            </>
          ) : null}

          {step === 4 ? (
            <>
              <Text style={styles.title}>Seller profile</Text>
              <Text style={styles.body}>
                Optional — photo and display name help buyers recognize your shop. Favorite categories are set when you
                create listings.
              </Text>
              <View style={styles.avatarBlock}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarPlaceholderText}>?</Text>
                  </View>
                )}
                <Pressable onPress={() => void pickPhoto()}>
                  <Text style={styles.link}>{profileImage ? 'Change photo' : 'Add profile photo'}</Text>
                </Pressable>
              </View>
              <Text style={styles.fieldLabel}>Display name / bio</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Tell buyers a little about your shop…"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                style={[styles.input, styles.textArea]}
              />
              <Pressable
                style={styles.agreementRow}
                onPress={() => setSellerAgreementAccepted((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sellerAgreementAccepted }}
              >
                <View style={[styles.agreementBox, sellerAgreementAccepted && styles.agreementBoxOn]}>
                  {sellerAgreementAccepted ? <Text style={styles.agreementCheck}>✓</Text> : null}
                </View>
                <Text style={styles.agreementText}>
                  I agree to the Get Vaulted{' '}
                  <Text style={styles.link} onPress={() => void Linking.openURL(siteUrls.termsSellerObligations())}>
                    seller obligations
                  </Text>
                  ,{' '}
                  <Text style={styles.link} onPress={() => void Linking.openURL(siteUrls.terms())}>
                    Terms of Service
                  </Text>
                  , and{' '}
                  <Text style={styles.link} onPress={() => void Linking.openURL(siteUrls.communityGuidelines())}>
                    Community Guidelines
                  </Text>
                  .
                </Text>
              </Pressable>
              <StepActions
                showBack
                onBack={goBack}
                primaryLabel={profileBusy ? 'Saving…' : 'Save & continue'}
                onPrimary={() => void saveProfile()}
                primaryDisabled={profileBusy || finishBusy || !sellerAgreementAccepted}
              />
              <SecondaryButton
                label="Continue without photo"
                onPress={() => void finishWizard()}
                disabled={profileBusy || finishBusy || !sellerAgreementAccepted}
              />
            </>
          ) : null}

          {step === 5 ? (
            <>
              <Text style={styles.completionIcon}>✅</Text>
              <Text style={[styles.title, styles.centerText]}>Seller setup complete</Text>
              <Text style={[styles.goldSub, styles.centerText]}>Welcome to Seller HQ</Text>
              <Text style={[styles.body, styles.centerText]}>
                You are ready to sell on Get Vaulted. Here is what is now unlocked:
              </Text>
              {['Create listings', 'Host live shows', 'Manage orders', 'Access Seller HQ'].map((item) => (
                <View key={item} style={styles.checkRow}>
                  <Text style={styles.checkMark}>✓</Text>
                  <Text style={styles.checkText}>{item}</Text>
                </View>
              ))}
              <StepActions
                showBack
                onBack={goBack}
                primaryLabel="Enter Seller HQ"
                onPrimary={enterHq}
              />
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  required,
  keyboardType,
  autoComplete,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  required?: boolean;
  keyboardType?: 'default' | 'phone-pad';
  autoComplete?: 'tel' | 'name';
}) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        autoCapitalize={keyboardType === 'phone-pad' ? 'none' : 'words'}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
      />
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [pressed && { opacity: 0.92 }, disabled && { opacity: 0.55 }]}
    >
      <LinearGradient colors={[colors.gold, '#E8D48B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.92 }, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.secondaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function StepActions({
  showBack,
  onBack,
  primaryLabel,
  onPrimary,
  primaryDisabled,
}: {
  showBack?: boolean;
  onBack?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
}) {
  return (
    <View style={styles.actions}>
      {showBack && onBack ? (
        <Pressable onPress={onBack} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.92 }]}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <PrimaryButton label={primaryLabel} onPress={onPrimary} disabled={primaryDisabled} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.lg },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  stepMeta: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginTop: 4 },
  progressTrack: {
    marginTop: spacing.sm,
    height: 6,
    width: 200,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 999 },
  scroll: { paddingBottom: spacing.xxxl },
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: colors.surfaceElevated,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { ...typography.title, color: colors.textPrimary },
  body: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  eyebrowInline: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.gold,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  infoRow: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  errorBox: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(240,120,120,0.35)',
    backgroundColor: 'rgba(80,20,20,0.25)',
    gap: spacing.xs,
  },
  errorText: { fontSize: 13, lineHeight: 18, color: '#f0a8a8' },
  noticeBox: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
    gap: spacing.xs,
  },
  noticeText: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  errorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  inlineLoader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  unlockRow: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  unlockTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  unlockDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  dashedBox: {
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  successBox: {
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.3)',
    backgroundColor: 'rgba(52,199,89,0.08)',
    alignItems: 'center',
  },
  successIcon: { fontSize: 28, color: colors.success },
  successTitle: { fontSize: 14, fontWeight: '700', color: colors.success, marginTop: spacing.xs },
  successSub: { fontSize: 12, color: 'rgba(52,199,89,0.7)', marginTop: 4, textAlign: 'center' },
  reconcileBox: {
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: 'rgba(212,175,55,0.06)',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reconcileText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 4 },
  fieldHint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  input: {
    height: 44,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0c0c10',
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: 14,
  },
  textArea: { height: 88, paddingTop: spacing.sm, textAlignVertical: 'top' },
  readOnlyField: {
    height: 44,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#08080a',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  readOnlyText: { fontSize: 14, color: colors.textMuted },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  avatarBlock: { alignItems: 'center', gap: spacing.sm },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  avatarPlaceholderText: { fontSize: 28, fontWeight: '700', color: colors.gold },
  agreementRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm },
  agreementBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  agreementBoxOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.15)' },
  agreementCheck: { fontSize: 12, fontWeight: '800', color: colors.gold },
  agreementText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  link: { fontSize: 12, fontWeight: '700', color: colors.gold },
  completionIcon: { fontSize: 36, textAlign: 'center' },
  centerText: { textAlign: 'center' },
  goldSub: { fontSize: 14, fontWeight: '700', color: colors.gold },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  checkMark: { color: colors.success, fontWeight: '700' },
  checkText: { fontSize: 14, color: colors.textPrimary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  backBtn: {
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  primaryBtn: {
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '800', color: '#1a1a1a' },
  secondaryBtn: {
    height: 44,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
});
