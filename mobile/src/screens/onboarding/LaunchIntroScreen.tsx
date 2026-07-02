import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Image,
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
import { useAuth } from '../../auth/AuthContext';
import { AUTH_USER_MESSAGES } from '../../lib/authUserMessages';
import {
  getRememberMePreference,
  loadRememberedCredentials,
  persistRememberMeCredentials,
} from '../../lib/rememberMeCredentials';
import { getKeepMeLoggedInPreference } from '../../lib/authSessionStorage';
import { enterGuestExploreAndOpenHome } from '../../navigation/enterGuestExploreFlow';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import {
  BEAT_COUNT,
  BEAT_OVERLAYS,
  COLLAPSE_END_P,
  HELMET_FLASH_URI,
  INTRO_TOTAL_MS,
  LOGO_ENTER_P,
  LOGO_SETTLE_P,
  MONTAGE_END_P,
  MONTAGE_URIS,
  prefetchIntroMontageAssets,
  VIGNETTE_END_P,
  VIGNETTE_PEAK_P,
  VIGNETTE_START_P,
  type MontageOverlay,
} from './introMontageAssets';

/** Mid-montage memorabilia flash — haptic fires as the cut lands. */
const HELMET_FLASH_HAPTIC_P = 0.304;
const MAX_WAIT_AUTH_MS = 8000;
const AUTH_HANDOFF_MS = 760;

type Props = NativeStackScreenProps<RootStackParamList, 'LaunchIntro'>;

/** Full-bleed cover sizing — extra bleed hides seams on tall iPhones during Ken Burns. */
function montageCoverFrame(width: number, height: number) {
  const bleed = Math.max(width, height) * 0.1;
  return {
    left: -bleed,
    top: -bleed,
    width: width + bleed * 2,
    height: height + bleed * 2,
  };
}

function montageMinScale(width: number, height: number): number {
  const aspect = height / Math.max(width, 1);
  return aspect > 2.05 ? 1.22 : aspect > 1.85 ? 1.18 : 1.14;
}

function montageBeatOpacity(p: number, beatIndex: number): number {
  'worklet';
  const segment = MONTAGE_END_P / BEAT_COUNT;
  const a = beatIndex * segment;
  const peak = a + segment * 0.48;
  const b = Math.min(a + segment * 1.12, MONTAGE_END_P + 0.04);
  if (p < a || p >= MONTAGE_END_P) return 0;
  if (p < peak) return interpolate(p, [a, peak], [0, 1], Extrapolation.CLAMP);
  return interpolate(p, [peak, b], [1, 0], Extrapolation.CLAMP);
}

function fireIntroLift() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

function fireBeatHit(beatIndex: number) {
  const style = beatIndex % 3 === 0 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
  void Haptics.impactAsync(style).catch(() => undefined);
}

function fireLogoSlam() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  setTimeout(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, 60);
}

function MontageOverlayGraphic({ overlay }: { overlay: MontageOverlay }) {
  switch (overlay) {
    case 'sold':
      return (
        <View style={styles.ovSold} pointerEvents="none">
          <Text style={styles.ovSoldTxt}>SOLD</Text>
        </View>
      );
    case 'bid':
      return (
        <View style={styles.ovBid} pointerEvents="none">
          {[0.45, 0.72, 1, 0.55, 0.88, 0.38, 0.95].map((h, i) => (
            <View key={i} style={[styles.bidBar, { height: 52 * h }]} />
          ))}
        </View>
      );
    case 'live':
      return (
        <View style={styles.ovLive} pointerEvents="none">
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTxt}>LIVE</Text>
          </View>
        </View>
      );
    case 'chat':
      return (
        <View style={styles.ovChat} pointerEvents="none">
          <View style={[styles.tickerLine, { width: '88%' }]} />
          <View style={[styles.tickerLine, { width: '72%', opacity: 0.75 }]} />
          <View style={[styles.tickerLine, { width: '80%', opacity: 0.55 }]} />
        </View>
      );
    case 'patch':
      return (
        <View style={styles.ovPatch} pointerEvents="none">
          <View style={styles.patchSwatch}>
            <LinearGradient
              colors={['rgba(55,62,78,0.55)', 'rgba(35,38,48,0.65)', 'rgba(72,62,52,0.4)']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.patchStitchL} />
            <View style={styles.patchStitchR} />
          </View>
        </View>
      );
    case 'breaker':
      return (
        <View style={styles.ovBreaker} pointerEvents="none">
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.03)', 'rgba(255,140,60,0.05)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.breakerEdge} />
        </View>
      );
    case 'refractor':
      return (
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(210,225,255,0.1)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      );
    case 'stream':
      return (
        <View style={styles.ovStream} pointerEvents="none">
          <View style={styles.streamBar} />
          <View style={[styles.streamBar, { width: '40%', opacity: 0.6 }]} />
        </View>
      );
    case 'chrome':
      return (
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)', 'rgba(200,215,235,0.1)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.25 }}
          end={{ x: 1, y: 0.75 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      );
    case 'slab':
      return (
        <LinearGradient
          colors={['rgba(0,0,0,0.28)', 'transparent', 'rgba(0,0,0,0.4)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      );
    case 'stadium':
      return (
        <LinearGradient
          colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.62)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      );
    case 'watch':
    case 'sneaker':
      return (
        <LinearGradient
          colors={['rgba(255,255,255,0.06)', 'transparent', 'rgba(0,0,0,0.48)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      );
    case 'bids':
      return (
        <View style={styles.ovBids} pointerEvents="none">
          <Text style={styles.bidTxt}>$24,500</Text>
          <Text style={styles.bidSub}>+ $2,100</Text>
        </View>
      );
    default:
      return null;
  }
}

function IntroHypeCopy({ progress }: { progress: SharedValue<number> }) {
  const micro = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.04, 0.1, 0.2, 0.26], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(progress.value, [0.04, 0.2], [0.92, 1], Extrapolation.CLAMP) }],
  }));
  const rail = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.1, 0.18, 0.32, 0.4], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(progress.value, [0.1, 0.4], [22, 0], Extrapolation.CLAMP) }],
  }));
  const mega = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.2, 0.3, 0.48, 0.56], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(progress.value, [0.2, 0.56], [28, 0], Extrapolation.CLAMP) },
      { scale: interpolate(progress.value, [0.2, 0.38, 0.52], [0.86, 1.06, 1], Extrapolation.CLAMP) },
    ],
  }));
  const brand = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.38, 0.46, 0.58, 0.66], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(progress.value, [0.38, 0.66], [18, 0], Extrapolation.CLAMP) }],
  }));
  return (
    <View style={styles.hypeWrap} pointerEvents="none">
      <Animated.Text style={[styles.hypeMicro, micro]}>GET VAULTED</Animated.Text>
      <Animated.Text style={[styles.hypeRail, rail]}>LIVE · CARDS · SNEAKERS · WATCHES · MEMORABILIA</Animated.Text>
      <Animated.Text style={[styles.hypeMega, mega]}>OWN THE PULL.</Animated.Text>
      <Animated.Text style={[styles.hypeBrand, brand]}>The premium live collectible network.</Animated.Text>
    </View>
  );
}

function IntroGoldSweep({ progress, frameW, frameH }: { progress: SharedValue<number>; frameW: number; frameH: number }) {
  const sweep = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.02, 0.1, 0.45, 0.55], [0, 0.5, 0.22, 0], Extrapolation.CLAMP),
    transform: [
      { rotate: '-14deg' },
      { translateX: interpolate(progress.value, [0, 0.52], [-frameW * 1.5, frameW * 1.5], Extrapolation.CLAMP) },
    ],
  }));
  return (
    <View style={styles.sweepClip} pointerEvents="none">
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 160,
            height: frameH * 1.45,
            left: frameW * 0.5 - 80,
            top: -frameH * 0.12,
          },
          sweep,
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,220,150,0.55)', 'rgba(212,175,55,0.45)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
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

function IntroHelmetFlash({
  progress,
  coverStyle,
}: {
  progress: SharedValue<number>;
  coverStyle: ReturnType<typeof montageCoverFrame>;
}) {
  const layer = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0.278, 0.302, 0.334, 0.366], [0, 0.98, 0.82, 0], Extrapolation.CLAMP),
    };
  });
  const ken = useAnimatedStyle(() => {
    const p = progress.value;
    const o = interpolate(p, [0.278, 0.302, 0.334, 0.366], [0, 0.98, 0.82, 0], Extrapolation.CLAMP);
    const scale = interpolate(o, [0, 0.55, 1], [1.14, 1.05, 1], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, layer]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, ken]}>
        <Image source={{ uri: HELMET_FLASH_URI }} style={[styles.montageImgBase, coverStyle]} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.86)']}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
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

function MontageLayer({
  beatIndex,
  progress,
  coverStyle,
  minKenScale,
}: {
  beatIndex: number;
  progress: SharedValue<number>;
  coverStyle: ReturnType<typeof montageCoverFrame>;
  minKenScale: number;
}) {
  const uri = MONTAGE_URIS[beatIndex % MONTAGE_URIS.length];
  const overlay = BEAT_OVERLAYS[beatIndex] ?? 'none';

  const ken = useAnimatedStyle(() => {
    const o = montageBeatOpacity(progress.value, beatIndex);
    const scale = interpolate(o, [0, 0.45, 1], [minKenScale, minKenScale * 0.92, 1], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  const layer = useAnimatedStyle(() => {
    const o = montageBeatOpacity(progress.value, beatIndex);
    return { opacity: o };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, layer]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, ken]}>
        <Image source={{ uri }} style={[styles.montageImgBase, coverStyle]} resizeMode="cover" />
      </Animated.View>
      <LinearGradient
        colors={['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.42)', 'rgba(0,0,0,0.88)']}
        style={StyleSheet.absoluteFill}
      />
      {overlay !== 'none' ? <MontageOverlayGraphic overlay={overlay} /> : null}
    </Animated.View>
  );
}

export function LaunchIntroScreen({ navigation, route }: Props) {
  const { width: frameW, height: frameH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const instantAuth = route.params?.instantAuth === true;
  const coverStyle = montageCoverFrame(frameW, frameH);
  const minKenScale = montageMinScale(frameW, frameH);
  const logoW = Math.min(frameW * 0.82, 320);
  const { user, loading: authLoading, signInWithPassword, signInWithGoogle, signInWithApple, requestPasswordReset, enterGuestExplore } = useAuth();
  const userRef = useRef(user);
  const authLoadingRef = useRef(authLoading);
  userRef.current = user;
  authLoadingRef.current = authLoading;

  const progress = useSharedValue(0);
  const authProgress = useSharedValue(0);
  const ambient = useSharedValue(0);
  const introEndAt = useRef(Date.now() + INTRO_TOTAL_MS);
  const skipped = useRef(false);
  const wentToBackground = useRef(false);
  const logoHapticFired = useRef(false);
  const helmetFlashHapticFired = useRef(false);
  const authHandoffStarted = useRef(false);
  const beatHapticsDone = useRef(new Set<number>());

  const fireBeatIfNew = useCallback((i: number) => {
    if (beatHapticsDone.current.has(i)) return;
    beatHapticsDone.current.add(i);
    fireBeatHit(i);
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
      const saved = await loadRememberedCredentials();
      if (saved) {
        setEmail(saved.email);
        setPassword(saved.password);
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
    authProgress.value = withTiming(1, { duration: AUTH_HANDOFF_MS, easing: Easing.out(Easing.cubic) });
  }, [authProgress]);

  const finishIntroRouting = useCallback(() => {
    if (userRef.current) {
      navigation.replace('MainTabs', { screen: 'Home' });
    } else {
      beginAuthContinuity();
    }
  }, [beginAuthContinuity, navigation]);

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

  const markHelmetFlashHaptic = useCallback(() => {
    if (helmetFlashHapticFired.current) return;
    helmetFlashHapticFired.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, []);

  useAnimatedReaction(
    () => progress.value,
    (value, previous) => {
      if (previous === null) return;
      if (previous < LOGO_ENTER_P && value >= LOGO_ENTER_P) {
        runOnJS(markLogoHaptic)();
      }
      if (previous < HELMET_FLASH_HAPTIC_P && value >= HELMET_FLASH_HAPTIC_P && value < MONTAGE_END_P) {
        runOnJS(markHelmetFlashHaptic)();
      }
      if (value >= MONTAGE_END_P) return;
      const seg = MONTAGE_END_P / BEAT_COUNT;
      for (let i = 0; i < BEAT_COUNT; i++) {
        const cross = i * seg + seg * 0.26;
        if (previous < cross && value >= cross) {
          runOnJS(fireBeatIfNew)(i);
        }
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
    helmetFlashHapticFired.current = false;
    skipped.current = false;
    authHandoffStarted.current = false;
    beatHapticsDone.current = new Set();
    progress.value = 0;
    authProgress.value = 0;
    introEndAt.current = Date.now() + INTRO_TOTAL_MS;

    let cancelled = false;

    if (instantAuth) {
      skipped.current = true;
      logoHapticFired.current = true;
      helmetFlashHapticFired.current = true;
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

    const start = async () => {
      await prefetchIntroMontageAssets(650);
      if (cancelled) return;
      fireIntroLift();
      introEndAt.current = Date.now() + INTRO_TOTAL_MS;
      progress.value = withTiming(
        1,
        { duration: INTRO_TOTAL_MS, easing: Easing.linear },
        (finished) => {
          if (finished) runOnJS(onTimelineFinished)();
        },
      );
    };

    void start();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') wentToBackground.current = true;
      if (next === 'active' && wentToBackground.current) {
        wentToBackground.current = false;
        skipToEnd();
      }
    });

    const runNav = async () => {
      await waitForAuth();
      while (Date.now() < introEndAt.current) {
        await new Promise((r) => setTimeout(r, 16));
      }
      if (cancelled) return;
      finishIntroRouting();
    };
    void runNav();

    return () => {
      cancelled = true;
      sub.remove();
      cancelAnimation(progress);
      cancelAnimation(authProgress);
    };
  }, [authProgress, finishIntroRouting, instantAuth, onTimelineFinished, progress, skipToEnd, waitForAuth]);

  const montageShell = useAnimatedStyle(() => {
    const collapseT = interpolate(progress.value, [MONTAGE_END_P, COLLAPSE_END_P], [0, 1], Extrapolation.CLAMP);
    const shellOp = interpolate(collapseT, [0, 0.35, 1], [1, 0.55, 0], Extrapolation.CLAMP);
    return { opacity: shellOp };
  });

  const vignette = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [VIGNETTE_START_P, VIGNETTE_PEAK_P, VIGNETTE_END_P],
      [0, 0.58, 0.14],
      Extrapolation.CLAMP,
    ),
  }));

  const logoShell = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [LOGO_ENTER_P, LOGO_ENTER_P + 0.028], [0, 1], Extrapolation.CLAMP),
  }));

  const logoScale = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          progress.value,
          [LOGO_ENTER_P, LOGO_ENTER_P + 0.045, LOGO_ENTER_P + 0.14, 1],
          [0.86, 1.08, 1, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

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
    transform: [{ translateY: interpolate(authProgress.value, [0, 1], [0, -Math.min(96, frameH * 0.12)]) }],
  }));

  const logoNudge = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(authProgress.value, [0, 1], [0, -18]) }],
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
    setErr(null);
    setBusy(true);
    try {
      await signInWithPassword(email, password, { persistSession: rememberMe });
      await persistRememberMeCredentials(rememberMe, email, password);
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Home' } }] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const onSocial = async (provider: 'google' | 'apple') => {
    setErr(null);
    setSocialBusy(provider);
    try {
      const result =
        provider === 'google'
          ? await signInWithGoogle({ persistSession: rememberMe })
          : await signInWithApple({ persistSession: rememberMe });
      if (result === 'success') {
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Home' } }] });
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

      <Animated.View style={[styles.montageStage, montageShell]} pointerEvents="none">
        {Array.from({ length: BEAT_COUNT }, (_, i) => (
          <MontageLayer
            key={i}
            beatIndex={i}
            progress={progress}
            coverStyle={coverStyle}
            minKenScale={minKenScale}
          />
        ))}
        <IntroHelmetFlash progress={progress} coverStyle={coverStyle} />
      </Animated.View>

      <IntroGoldSweep progress={progress} frameW={frameW} frameH={frameH} />
      <IntroImpactBurst progress={progress} frameW={frameW} frameH={frameH} />
      <IntroHypeCopy progress={progress} />

      <Animated.View style={[styles.vignette, vignette]} pointerEvents="none" />

      <IntroVaultFlash progress={progress} />

      <KeyboardAvoidingView
        style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollInner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.finale, { minHeight: frameH * 0.72 }, cameraPush, blockLift]} pointerEvents="box-none">
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
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
              <AuthPasswordField
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
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

              <Pressable style={styles.forgotWrap} onPress={() => { setForgotEmail(email); setForgotOpen(true); }}>
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

              <Pressable style={styles.link} onPress={() => navigation.navigate('AuthSignUp')}>
                <Text style={styles.linkTxt}>Create account</Text>
              </Pressable>

              <Pressable
                style={styles.exploreBtn}
                onPress={() => enterGuestExploreAndOpenHome(enterGuestExplore)}
              >
                <Text style={styles.exploreBtnTxt}>Explore Get Vaulted</Text>
              </Pressable>
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
  montageStage: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  montageImgBase: {
    position: 'absolute',
  },
  scrollInner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
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
  hypeWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: '18%',
    zIndex: 4,
    gap: 10,
  },
  hypeMicro: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
    width: '92%',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  hypeRail: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    textAlign: 'center',
    width: '92%',
  },
  hypeMega: {
    color: colors.gold,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1.2,
    textAlign: 'center',
    width: '94%',
    textShadowColor: 'rgba(0,0,0,0.88)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 16,
  },
  hypeBrand: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
    width: '90%',
    lineHeight: 20,
  },
  sweepClip: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    overflow: 'hidden',
  },
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
});
