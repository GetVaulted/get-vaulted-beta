import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  useWindowDimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthPasswordField } from '../../components/auth/AuthPasswordField';
import { SocialAuthButtons, socialAuthErrorMessage } from '../../components/auth/SocialAuthButtons';
import { BrandLogo } from '../../components/ui/BrandLogo';
import { LegalConsentNote } from '../../components/legal/LegalConsentNote';
import { useAuth } from '../../auth/AuthContext';
import { AUTH_USER_MESSAGES } from '../../lib/authUserMessages';
import {
  getRememberMePreference,
  loadRememberedEmail,
  persistRememberMeCredentials,
} from '../../lib/rememberMeCredentials';
import { getKeepMeLoggedInPreference } from '../../lib/authSessionStorage';
import { enterGuestExploreAndOpenHome } from '../../navigation/enterGuestExploreFlow';
import { navigateAfterSignIn } from '../../navigation/navigateAfterSignIn';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { shouldAutoAdvanceAfterAuthRecovery } from './launchIntroAuthRecovery';
import { INTRO_TOTAL_MS, LOGO_ENTER_P, LOGO_SETTLE_P } from './introMontageAssets';

const MAX_WAIT_AUTH_MS = 8000;
const AUTH_HANDOFF_MS = 760;

type Props = NativeStackScreenProps<RootStackParamList, 'LaunchIntro'>;

function fireIntroLift() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

function fireLogoSlam() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  setTimeout(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, 60);
}

function IntroVaultFlash({ progress }: { progress: SharedValue<number> }) {
  const flash = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [LOGO_ENTER_P, LOGO_ENTER_P + 0.02, LOGO_ENTER_P + 0.07], [0, 0.38, 0], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View style={[styles.vaultFlash, flash]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(255,252,245,0.95)', 'rgba(212,175,55,0.35)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

function ImpactRing({ progress, delay }: { progress: SharedValue<number>; delay: number }) {
  const ring = useAnimatedStyle(() => {
    const t = interpolate(progress.value, [LOGO_ENTER_P - 0.06 + delay, LOGO_ENTER_P + 0.14], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(t, [0, 0.42, 1], [0, 0.52, 0]),
      transform: [{ scale: interpolate(t, [0, 1], [0.45, 2.85]) }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          borderRadius: 9999,
          borderWidth: 3,
          borderColor: 'rgba(255, 200, 110, 0.72)',
        },
        ring,
      ]}
    />
  );
}

function IntroImpactBurst({ progress, frameW, frameH }: { progress: SharedValue<number>; frameW: number; frameH: number }) {
  const size = Math.min(frameW, frameH) * 0.46;
  return (
    <View style={styles.impactAnchor} pointerEvents="none">
      <View style={{ width: size, height: size, position: 'relative' }}>
        <ImpactRing progress={progress} delay={0.055} />
        <ImpactRing progress={progress} delay={0.028} />
        <ImpactRing progress={progress} delay={0} />
      </View>
    </View>
  );
}

export function LaunchIntroScreen({ navigation, route }: Props) {
  const { width: frameW, height: frameH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const instantAuth = route.params?.instantAuth === true;
  const logoW = Math.min(frameW * 0.82, 320);
  const { user, loading: authLoading, signInWithPassword, signInWithGoogle, signInWithApple, requestPasswordReset, enterGuestExplore } = useAuth();
  const userRef = useRef(user);
  const authLoadingRef = useRef(authLoading);
  userRef.current = user;
  authLoadingRef.current = authLoading;

  const [authUiVisible, setAuthUiVisible] = useState(instantAuth);
  const progress = useSharedValue(0);
  const authProgress = useSharedValue(0);
  const ambient = useSharedValue(0);
  const introEndAt = useRef(Date.now() + INTRO_TOTAL_MS);
  const skipped = useRef(false);
  const wentToBackground = useRef(false);
  const logoHapticFired = useRef(false);
  const authHandoffStarted = useRef(false);
  /** Has the user interacted with the login form since it was shown (see `markFormTouched`)? */
  const formTouchedRef = useRef(false);
  /** Guards against auto-advancing more than once per screen instance. */
  const autoAdvancedAfterRecoveryRef = useRef(false);

  const markFormTouched = useCallback(() => {
    formTouchedRef.current = true;
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<'google' | 'apple' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      // SECURITY: only the email is ever remembered (never the password) — see rememberMeCredentials.ts.
      const savedEmail = await loadRememberedEmail();
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
        return;
      }
      const rememberPref = await getRememberMePreference();
      setRememberMe(rememberPref || (await getKeepMeLoggedInPreference()));
    })();
  }, []);

  const waitForAuth = useCallback(async () => {
    const start = Date.now();
    while (authLoadingRef.current && Date.now() - start < MAX_WAIT_AUTH_MS) {
      await new Promise((r) => setTimeout(r, 40));
    }
  }, []);

  const beginAuthContinuity = useCallback(() => {
    if (authHandoffStarted.current) return;
    authHandoffStarted.current = true;
    setAuthUiVisible(true);
    authProgress.value = withTiming(1, { duration: AUTH_HANDOFF_MS, easing: Easing.out(Easing.cubic) });
  }, [authProgress]);

  const finishIntroRouting = useCallback(() => {
    if (userRef.current) {
      // Must run the same setup gate as Apple/Google sign-in — do not jump to MainTabs
      // with an auto-allocated username (usernameChosenAt still null).
      void navigateAfterSignIn(navigation);
    } else {
      beginAuthContinuity();
    }
  }, [beginAuthContinuity, navigation]);

  // Self-correct if the session recovers after we already decided to show the login form (e.g. the
  // `instantAuth` warm-resume path landed here because of a transient session blip that took longer
  // than AuthSessionRoutingEffect's grace window to resolve). Safe even for a real, intentional
  // sign-out: `user` never becomes non-null again on its own in that case, so this simply never
  // fires. The `formTouchedRef` guard avoids yanking the screen away from someone actively typing.
  useEffect(() => {
    if (
      shouldAutoAdvanceAfterAuthRecovery({
        loginUiShown: authHandoffStarted.current,
        formTouched: formTouchedRef.current,
        alreadyAdvanced: autoAdvancedAfterRecoveryRef.current,
        hasUser: Boolean(user),
      })
    ) {
      autoAdvancedAfterRecoveryRef.current = true;
      void navigateAfterSignIn(navigation);
    }
  }, [user, navigation]);

  const skipToEnd = useCallback(() => {
    if (skipped.current) return;
    skipped.current = true;
    cancelAnimation(progress);
    progress.value = 1;
    introEndAt.current = Date.now();
  }, [progress]);

  const onTimelineFinished = useCallback(() => {
    skipped.current = true;
  }, []);

  const markLogoHaptic = useCallback(() => {
    if (logoHapticFired.current) return;
    logoHapticFired.current = true;
    fireLogoSlam();
  }, []);

  useAnimatedReaction(
    () => progress.value,
    (value, previous) => {
      if (previous === null) return;
      if (previous < LOGO_ENTER_P && value >= LOGO_ENTER_P) {
        runOnJS(markLogoHaptic)();
      }
    },
  );

  useEffect(() => {
    ambient.value = withRepeat(
      withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(ambient);
  }, [ambient]);

  useEffect(() => {
    logoHapticFired.current = false;
    skipped.current = false;
    authHandoffStarted.current = false;
    formTouchedRef.current = false;
    autoAdvancedAfterRecoveryRef.current = false;
    setAuthUiVisible(instantAuth);
    progress.value = 0;
    authProgress.value = 0;
    introEndAt.current = Date.now() + INTRO_TOTAL_MS;

    let cancelled = false;

    if (instantAuth) {
      skipped.current = true;
      logoHapticFired.current = true;
      progress.value = 1;
      introEndAt.current = Date.now();
      const runInstant = async () => {
        await waitForAuth();
        if (cancelled) return;
        finishIntroRouting();
      };
      void runInstant();
      return () => {
        cancelled = true;
        cancelAnimation(progress);
        cancelAnimation(authProgress);
      };
    }

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') wentToBackground.current = true;
      if (next === 'active' && wentToBackground.current) {
        wentToBackground.current = false;
        skipToEnd();
      }
    });

    const run = async () => {
      await waitForAuth();
      if (cancelled) return;

      // Returning signed-in users: skip the intro and route immediately.
      if (userRef.current) {
        skipped.current = true;
        logoHapticFired.current = true;
        progress.value = 1;
        introEndAt.current = Date.now();
        finishIntroRouting();
        return;
      }

      fireIntroLift();
      introEndAt.current = Date.now() + INTRO_TOTAL_MS;
      progress.value = withTiming(
        1,
        { duration: INTRO_TOTAL_MS, easing: Easing.linear },
        (finished) => {
          if (finished) runOnJS(onTimelineFinished)();
        },
      );

      while (Date.now() < introEndAt.current) {
        await new Promise((r) => setTimeout(r, 16));
      }
      if (cancelled) return;
      finishIntroRouting();
    };
    void run();

    return () => {
      cancelled = true;
      sub.remove();
      cancelAnimation(progress);
      cancelAnimation(authProgress);
    };
  }, [authProgress, finishIntroRouting, instantAuth, onTimelineFinished, progress, skipToEnd, waitForAuth]);

  const logoShell = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [LOGO_ENTER_P, LOGO_ENTER_P + 0.028], [0, 1], Extrapolation.CLAMP),
  }));

  const logoScale = useAnimatedStyle(() => {
    const introScale = interpolate(
      progress.value,
      [LOGO_ENTER_P, LOGO_ENTER_P + 0.045, LOGO_ENTER_P + 0.14, 1],
      [0.86, 1.08, 1, 1],
      Extrapolation.CLAMP,
    );
    const authCompact = interpolate(authProgress.value, [0, 1], [1, 0.76], Extrapolation.CLAMP);
    return { transform: [{ scale: introScale * authCompact }] };
  });

  const cameraPush = useAnimatedStyle(() => {
    const introZoom = interpolate(progress.value, [LOGO_ENTER_P, LOGO_SETTLE_P, 1], [1, 1.035, 1.02], Extrapolation.CLAMP);
    const authSettle = interpolate(authProgress.value, [0, 1], [1, 0.992]);
    return { transform: [{ scale: introZoom * authSettle }] };
  });

  const liveCombined = useAnimatedStyle(() => {
    const base = interpolate(progress.value, [LOGO_ENTER_P + 0.04, LOGO_ENTER_P + 0.1, 1], [0, 1, 1], Extrapolation.CLAMP);
    const authFade = interpolate(authProgress.value, [0, 0.38], [1, 0], Extrapolation.CLAMP);
    return { opacity: base * authFade };
  });

  const blockLift = useAnimatedStyle(() => ({
    transform: [{ translateY: 0 }],
  }));

  const logoNudge = useAnimatedStyle(() => ({
    transform: [{ translateY: 0 }],
  }));

  const authBlock = useAnimatedStyle(() => ({
    opacity: interpolate(authProgress.value, [0.08, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(authProgress.value, [0, 1], [26, 0], Extrapolation.CLAMP) },
    ],
  }));

  const ambientDrift = useAnimatedStyle(() => ({
    opacity: interpolate(ambient.value, [0, 0.5, 1], [0.04, 0.09, 0.04], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(ambient.value, [0, 1], [-18, 18], Extrapolation.CLAMP) }],
  }));

  const onSubmit = async () => {
    markFormTouched();
    setErr(null);
    setBusy(true);
    try {
      await signInWithPassword(email, password, { persistSession: rememberMe });
      await persistRememberMeCredentials(rememberMe, email);
      await navigateAfterSignIn(navigation);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const onSocial = async (provider: 'google' | 'apple') => {
    markFormTouched();
    setErr(null);
    setSocialBusy(provider);
    try {
      const result =
        provider === 'google'
          ? await signInWithGoogle({ persistSession: rememberMe })
          : await signInWithApple({ persistSession: rememberMe });
      if (result === 'success') {
        await navigateAfterSignIn(navigation);
      } else if (result === 'error') {
        setErr(AUTH_USER_MESSAGES.socialSignInFailed);
      }
    } catch (e) {
      setErr(socialAuthErrorMessage(e));
    } finally {
      setSocialBusy(null);
    }
  };

  const onForgotSend = async () => {
    const em = forgotEmail.trim() || email.trim();
    if (!em) {
      Alert.alert('Email required', 'Enter the email you used to register.');
      return;
    }
    setForgotBusy(true);
    try {
      await requestPasswordReset(em);
      setForgotOpen(false);
      Alert.alert('Check your email', 'If an account exists for that address, you will receive a reset link shortly.');
    } catch (e) {
      Alert.alert('Could not send reset', e instanceof Error ? e.message : 'Error');
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['#000000', '#020202', '#000000']} style={StyleSheet.absoluteFill} />
      </View>

      <Animated.View style={[StyleSheet.absoluteFill, ambientDrift]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(255,200,120,0.12)', 'transparent', 'rgba(212,175,55,0.08)', 'transparent']}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <IntroImpactBurst progress={progress} frameW={frameW} frameH={frameH} />

      <IntroVaultFlash progress={progress} />

      {!instantAuth && !authUiVisible ? (
        <Pressable
          style={[styles.skipBtn, { top: insets.top + 12 }]}
          onPress={skipToEnd}
          accessibilityRole="button"
          accessibilityLabel="Skip intro"
          hitSlop={12}
        >
          <Text style={styles.skipBtnTxt}>Skip</Text>
        </Pressable>
      ) : null}

      <KeyboardAvoidingView
        style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollInner,
            { minHeight: frameH - insets.top - insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
        >
          <Animated.View
            style={[
              styles.finale,
              cameraPush,
              blockLift,
            ]}
            pointerEvents="box-none"
          >
            <Animated.View style={logoNudge}>
              <Animated.View style={[styles.logoBlock, logoShell]}>
                <Animated.View style={logoScale}>
                  <View style={styles.brandClip}>
                    <BrandLogo width={logoW} />
                  </View>
                </Animated.View>
                <Animated.View style={[styles.liveRow, liveCombined]}>
                  <View style={styles.liveCore} />
                  <Text style={styles.liveLbl}>LIVE</Text>
                </Animated.View>
              </Animated.View>
            </Animated.View>

            <Animated.View style={[styles.authWrap, authBlock]}>
              <Text style={styles.tagline}>Welcome back</Text>

              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={(text) => {
                  markFormTouched();
                  setEmail(text);
                }}
              />
              <AuthPasswordField
                placeholder="Password"
                value={password}
                onChangeText={(text) => {
                  markFormTouched();
                  setPassword(text);
                }}
                visible={passwordVisible}
                onToggleVisible={() => setPasswordVisible((v) => !v)}
                autoComplete="password"
                containerStyle={styles.introPasswordRow}
              />

              <Pressable
                style={styles.rememberRow}
                onPress={() => setRememberMe((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberMe }}
                accessibilityLabel="Remember me"
              >
                <Ionicons
                  name={rememberMe ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={rememberMe ? colors.gold : colors.textMuted}
                />
                <Text style={styles.rememberLabel}>Remember me</Text>
              </Pressable>

              <Pressable
                style={styles.forgotWrap}
                onPress={() => {
                  markFormTouched();
                  setForgotEmail(email);
                  setForgotOpen(true);
                }}
              >
                <Text style={styles.forgotTxt}>Forgot password?</Text>
              </Pressable>

              {err ? <Text style={styles.err}>{err}</Text> : null}

              <Pressable
                style={[styles.primary, (busy || authLoading) && { opacity: 0.7 }]}
                disabled={busy || authLoading || Boolean(socialBusy)}
                onPress={() => void onSubmit()}
              >
                {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryTxt}>Sign In</Text>}
              </Pressable>

              <SocialAuthButtons
                onGoogle={() => void onSocial('google')}
                onApple={() => void onSocial('apple')}
                busy={socialBusy}
                disabled={busy || authLoading}
                error={null}
              />

              <Pressable
                style={styles.link}
                onPress={() => {
                  markFormTouched();
                  navigation.navigate('AuthSignUp');
                }}
              >
                <Text style={styles.linkTxt}>Create account</Text>
              </Pressable>

              <Pressable
                style={styles.exploreBtn}
                onPress={() => {
                  markFormTouched();
                  enterGuestExploreAndOpenHome(enterGuestExplore);
                }}
              >
                <Text style={styles.exploreBtnTxt}>Explore Get Vaulted</Text>
              </Pressable>

              <LegalConsentNote />
            </Animated.View>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={forgotOpen} transparent animationType="fade" onRequestClose={() => setForgotOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setForgotOpen(false)}>
          <Pressable style={[styles.modalCard, { marginBottom: insets.bottom }]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Reset password</Text>
            <Text style={styles.modalBody}>We will email you a link from Supabase to choose a new password.</Text>
            <TextInput
              style={styles.input}
              placeholder="Your account email"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={forgotEmail}
              onChangeText={setForgotEmail}
            />
            <View style={styles.modalRow}>
              <Pressable style={styles.modalGhost} onPress={() => setForgotOpen(false)}>
                <Text style={styles.modalGhostTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalGold, forgotBusy && { opacity: 0.7 }]}
                disabled={forgotBusy}
                onPress={() => void onForgotSend()}
              >
                {forgotBusy ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.modalGoldTxt}>Send link</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  flex: { flex: 1, zIndex: 10 },
  scrollInner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  finale: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBlock: { alignItems: 'center', gap: 18 },
  brandClip: { paddingVertical: 8 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  liveCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.live,
    shadowColor: colors.live,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 10,
  },
  liveLbl: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  vaultFlash: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 14,
  },
  impactAnchor: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: '14%',
  },
  authWrap: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  tagline: {
    ...typography.body,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.05)',
    fontSize: 16,
  },
  introPasswordRow: {
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  rememberLabel: { color: colors.textSecondary, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  forgotWrap: { alignSelf: 'flex-end', paddingVertical: spacing.xs },
  forgotTxt: { color: colors.gold, fontSize: 14, fontWeight: '600' },
  err: { color: '#f0a8a8', fontSize: 13 },
  primary: {
    backgroundColor: colors.gold,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  primaryTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
  link: { paddingVertical: spacing.lg, alignItems: 'center' },
  linkTxt: { color: colors.gold, fontWeight: '700', fontSize: 15 },
  exploreBtn: {
    marginTop: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  exploreBtnTxt: { color: 'rgba(255,255,255,0.88)', fontWeight: '700', fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    borderRadius: radii.lg,
    padding: spacing.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.md,
  },
  modalTitle: { ...typography.title, color: colors.textPrimary, fontSize: 18 },
  modalBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  modalRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  modalGhost: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalGhostTxt: { color: colors.textPrimary, fontWeight: '700' },
  modalGold: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  modalGoldTxt: { color: colors.background, fontWeight: '800' },
  ovSold: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ovSoldTxt: {
    color: colors.live,
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: 4,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  ovBid: {
    position: 'absolute',
    right: '7%',
    bottom: '18%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
  },
  bidBar: { width: 5, borderRadius: 1, backgroundColor: 'rgba(220,230,255,0.72)' },
  ovLive: { position: 'absolute', top: '8%', left: '7%' },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,80,64,0.55)',
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  liveTxt: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  ovChat: { position: 'absolute', left: '6%', bottom: '18%', gap: 5 },
  tickerLine: { height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.14)' },
  ovPatch: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 28,
  },
  patchSwatch: {
    width: '34%',
    aspectRatio: 1.35,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
    position: 'relative',
  },
  patchStitchL: {
    position: 'absolute',
    left: 3,
    top: 4,
    bottom: 4,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  patchStitchR: {
    position: 'absolute',
    right: 3,
    top: 4,
    bottom: 4,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  ovBreaker: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  breakerEdge: {
    height: '22%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  ovStream: { position: 'absolute', bottom: '10%', left: '8%', right: '8%', gap: 6 },
  streamBar: { height: 3, width: '100%', borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  ovBids: { position: 'absolute', top: '14%', right: '8%', alignItems: 'flex-end' },
  bidTxt: { color: 'rgba(240,245,255,0.95)', fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  bidSub: { color: 'rgba(180,200,230,0.85)', fontSize: 14, fontWeight: '800', marginTop: 2 },
  skipBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  skipBtnTxt: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
});
