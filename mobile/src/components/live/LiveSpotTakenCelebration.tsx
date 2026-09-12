import { useEffect, useRef, useState } from 'react';
import { AppState, Animated, Easing, Modal, StyleSheet, View, type AppStateStatus } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import {
  formatSpotCelebrationAccessibility,
  isSpotCelebrationViewerWinner,
  spotCelebrationDismissKey,
  spotCelebrationHeadline,
  spotCelebrationKicker,
  spotCelebrationTagline,
  SPOT_CELEBRATION_DISPLAY_MS,
  type LiveSpotTakenCelebration,
} from '../../lib/liveSpotCelebration';
import { colors, radii, spacing } from '../../theme';
import { LiveRoomText } from './LiveRoomText';

type Props = {
  celebration: LiveSpotTakenCelebration | null;
  onDone: () => void;
  viewerUsername?: string | null;
};

const DISPLAY_MS = SPOT_CELEBRATION_DISPLAY_MS;

/** "Vault Strike" border — on-brand gold, replaces the old purple/fuchsia claim-CTA gradient. */
const VAULT_BORDER_GRADIENT = ['#FFE9A8', colors.gold, colors.goldMuted] as const;

const SPARK_COUNT = 10;
const COIN_COUNT = 6;

type SparkConfig = { angleDeg: number; distance: number };
type CoinConfig = {
  angleDeg: number;
  spread: number;
  rise: number;
  fall: number;
  rotationDeg: number;
  size: number;
};

/** Fresh per-trigger randomization — no two hits fly the same way. */
function makeSparkConfigs(): SparkConfig[] {
  return Array.from({ length: SPARK_COUNT }, (_, i) => ({
    angleDeg: (360 / SPARK_COUNT) * i + (Math.random() * 16 - 8),
    distance: 62 + Math.random() * 46,
  }));
}

function makeCoinConfigs(): CoinConfig[] {
  return Array.from({ length: COIN_COUNT }, () => ({
    angleDeg: -90 + (Math.random() * 150 - 75),
    spread: 60 + Math.random() * 46,
    rise: 34 + Math.random() * 22,
    fall: 30 + Math.random() * 26,
    rotationDeg: (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 260),
    size: 8 + Math.random() * 4,
  }));
}

/** PYT/PYD spot win — full-screen "Vault Strike" hype card: gavel strike, gold shockwave, spark/coin
 * burst with real per-trigger randomization, spring-driven card + headline. Mount last in the tree
 * so it stacks above checkout modals. */
export function LiveSpotTakenCelebration({ celebration, onDone, viewerUsername }: Props) {
  const onDoneRef = useRef(onDone);
  const shownAtRef = useRef<number | null>(null);

  const cardScale = useRef(new Animated.Value(0.9)).current;
  const headlineScale = useRef(new Animated.Value(1)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const shakeY = useRef(new Animated.Value(0)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const hammerProgress = useRef(new Animated.Value(0)).current;
  const shock1Progress = useRef(new Animated.Value(0)).current;
  const shock2Progress = useRef(new Animated.Value(0)).current;
  const sparkProgress = useRef(new Animated.Value(0)).current;
  const coinProgress = useRef(new Animated.Value(0)).current;

  const sparkConfigsRef = useRef<SparkConfig[]>(makeSparkConfigs());
  const coinConfigsRef = useRef<CoinConfig[]>(makeCoinConfigs());
  const [burstSeed, setBurstSeed] = useState(0);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const dismissKey = celebration ? spotCelebrationDismissKey(celebration) : null;
  const viewerIsWinner = celebration ? isSpotCelebrationViewerWinner(celebration, viewerUsername) : false;

  useEffect(() => {
    if (!dismissKey) {
      shownAtRef.current = null;
      cardScale.setValue(0.9);
      headlineScale.setValue(1);
      shakeX.setValue(0);
      shakeY.setValue(0);
      flashOpacity.setValue(0);
      hammerProgress.setValue(0);
      shock1Progress.setValue(0);
      shock2Progress.setValue(0);
      sparkProgress.setValue(0);
      coinProgress.setValue(0);
      return undefined;
    }

    if (viewerIsWinner) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    shownAtRef.current = Date.now();

    sparkConfigsRef.current = makeSparkConfigs();
    coinConfigsRef.current = makeCoinConfigs();
    setBurstSeed((n) => n + 1);

    cardScale.setValue(0.8);
    headlineScale.setValue(2.2);
    shakeX.setValue(0);
    shakeY.setValue(0);
    flashOpacity.setValue(0);
    hammerProgress.setValue(0);
    shock1Progress.setValue(0);
    shock2Progress.setValue(0);
    sparkProgress.setValue(0);
    coinProgress.setValue(0);

    const WIND_UP_MS = 220;

    const impactTimer = setTimeout(() => {
      Animated.timing(hammerProgress, {
        toValue: 1,
        duration: 260,
        easing: Easing.bezier(0.5, 0, 0.3, 1),
        useNativeDriver: true,
      }).start();

      Animated.sequence([
        Animated.timing(flashOpacity, { toValue: 0.85, duration: 55, useNativeDriver: true }),
        Animated.timing(flashOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();

      Animated.timing(shock1Progress, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      Animated.sequence([
        Animated.delay(60),
        Animated.timing(shock2Progress, {
          toValue: 1,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

      // randomized screen-kick — a fresh jitter sequence every time, not a fixed wiggle
      const kicks = 5;
      const decayed = Array.from({ length: kicks }, (_, i) => 1 - i / kicks);
      Animated.sequence(
        decayed.map((decay) =>
          Animated.timing(shakeX, {
            toValue: (Math.random() * 2 - 1) * 7 * decay,
            duration: 40,
            useNativeDriver: true,
          }),
        ),
      ).start();
      Animated.sequence(
        decayed.map((decay) =>
          Animated.timing(shakeY, {
            toValue: (Math.random() * 2 - 1) * 7 * decay,
            duration: 40,
            useNativeDriver: true,
          }),
        ),
      ).start(() => {
        shakeX.setValue(0);
        shakeY.setValue(0);
      });

      Animated.timing(sparkProgress, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      Animated.timing(coinProgress, {
        toValue: 1,
        duration: 1300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

      Animated.spring(cardScale, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }).start();

      Animated.spring(headlineScale, {
        toValue: 1,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }).start(() => {
        Animated.sequence([
          Animated.delay(60),
          Animated.timing(headlineScale, {
            toValue: 1.06,
            duration: 140,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(headlineScale, {
            toValue: 1,
            duration: 200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      });
    }, WIND_UP_MS);

    const dismissTimer = setTimeout(() => onDoneRef.current(), DISPLAY_MS);

    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active' || shownAtRef.current == null) return;
      if (Date.now() - shownAtRef.current >= DISPLAY_MS) {
        onDoneRef.current();
      }
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      clearTimeout(impactTimer);
      clearTimeout(dismissTimer);
      sub.remove();
    };
  }, [
    cardScale,
    dismissKey,
    headlineScale,
    shakeX,
    shakeY,
    flashOpacity,
    hammerProgress,
    shock1Progress,
    shock2Progress,
    sparkProgress,
    coinProgress,
  ]);

  if (!celebration) return null;

  const headline = spotCelebrationHeadline(celebration.kind, { viewerIsWinner });
  const accessibilityLabel = formatSpotCelebrationAccessibility(celebration, { viewerIsWinner });
  const sparkConfigs = sparkConfigsRef.current;
  const coinConfigs = coinConfigsRef.current;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      accessibilityViewIsModal
      onRequestClose={onDone}
    >
      <View
        style={styles.host}
        pointerEvents="none"
        accessibilityRole="alert"
        accessibilityLabel={accessibilityLabel}
      >
        <Animated.View
          style={[styles.shakeLayer, { transform: [{ translateX: shakeX }, { translateY: shakeY }] }]}
        >
          <Animated.View style={[styles.flash, { opacity: flashOpacity }]} />

          <Animated.View
            style={[
              styles.shock,
              {
                opacity: shock1Progress.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 0] }),
                transform: [
                  {
                    scale: shock1Progress.interpolate({
                      inputRange: [0, 0.08, 1],
                      outputRange: [0.3, 0.5, 6.5],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.shock,
              styles.shockAlt,
              {
                opacity: shock2Progress.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 0] }),
                transform: [
                  {
                    scale: shock2Progress.interpolate({
                      inputRange: [0, 0.08, 1],
                      outputRange: [0.3, 0.5, 6.5],
                    }),
                  },
                ],
              },
            ]}
          />

          <Animated.View
            style={[
              styles.hammer,
              {
                opacity: hammerProgress.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
                transform: [
                  {
                    rotate: hammerProgress.interpolate({
                      inputRange: [0, 0.55, 0.8, 1],
                      outputRange: ['-52deg', '4deg', '-6deg', '-6deg'],
                    }),
                  },
                  {
                    scale: hammerProgress.interpolate({
                      inputRange: [0, 0.55, 0.8, 1],
                      outputRange: [0.9, 1.05, 1, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Svg width={30} height={30} viewBox="0 0 24 24">
              <Rect x={2} y={14} width={15} height={4.5} rx={1.2} transform="rotate(-45 2 14)" fill={colors.gold} />
              <Rect x={11.5} y={2} width={8} height={8} rx={1.4} transform="rotate(-45 11.5 2)" fill="#FFE9A8" />
              <Rect x={9} y={4.5} width={8} height={8} rx={1.4} transform="rotate(-45 9 4.5)" fill={colors.gold} />
            </Svg>
          </Animated.View>

          <View style={styles.particleLayer}>
            {sparkConfigs.map((spark, index) => {
              const rad = (spark.angleDeg * Math.PI) / 180;
              return (
                <Animated.View
                  key={`spark-${index}`}
                  style={[
                    styles.spark,
                    {
                      opacity: sparkProgress.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 0] }),
                      transform: [
                        {
                          translateX: sparkProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, Math.cos(rad) * spark.distance],
                          }),
                        },
                        {
                          translateY: sparkProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, Math.sin(rad) * spark.distance],
                          }),
                        },
                        { rotate: `${spark.angleDeg}deg` },
                        {
                          scale: sparkProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
                        },
                      ],
                    },
                  ]}
                >
                  <LinearGradient colors={['#FFE9A8', colors.gold]} style={styles.sparkFill} />
                </Animated.View>
              );
            })}
            {coinConfigs.map((coin, index) => {
              const rad = (coin.angleDeg * Math.PI) / 180;
              return (
                <Animated.View
                  key={`coin-${index}`}
                  style={[
                    styles.coin,
                    {
                      width: coin.size,
                      height: coin.size,
                      borderRadius: coin.size / 2,
                      marginLeft: -coin.size / 2,
                      marginTop: -coin.size / 2,
                      opacity: coinProgress.interpolate({
                        inputRange: [0, 0.08, 0.75, 1],
                        outputRange: [0, 1, 1, 0],
                      }),
                      transform: [
                        {
                          translateX: coinProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, Math.cos(rad) * coin.spread],
                          }),
                        },
                        {
                          translateY: coinProgress.interpolate({
                            inputRange: [0, 0.35, 1],
                            outputRange: [0, -coin.rise, coin.fall],
                          }),
                        },
                        {
                          rotate: coinProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', `${coin.rotationDeg}deg`],
                          }),
                        },
                        {
                          scale: coinProgress.interpolate({
                            inputRange: [0, 0.15, 1],
                            outputRange: [0.6, 1, 0.85],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <LinearGradient colors={['#FFF6DD', '#FFE9A8', colors.gold]} style={StyleSheet.absoluteFill} />
                </Animated.View>
              );
            })}
          </View>

          <Animated.View style={[styles.cardWrap, { transform: [{ scale: cardScale }] }]}>
            <LinearGradient
              colors={[...VAULT_BORDER_GRADIENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradientBorder}
            >
              <View style={styles.cardInner}>
                <View style={styles.kickerRow}>
                  <Svg width={11} height={11} viewBox="0 0 24 24">
                    <Path d="M14 3l7 7-2 2-7-7 2-2z" fill={colors.gold} />
                    <Path d="M12.5 6.5l5 5L6 23H3v-3l9.5-13.5z" fill={colors.gold} />
                  </Svg>
                  <LiveRoomText style={styles.kicker}>{spotCelebrationKicker(celebration.kind)}</LiveRoomText>
                </View>
                <Animated.View style={{ transform: [{ scale: headlineScale }] }}>
                  <LiveRoomText style={styles.headline}>{headline}</LiveRoomText>
                </Animated.View>
                <LiveRoomText style={styles.label} numberOfLines={2}>
                  {celebration.label}
                </LiveRoomText>
                {!viewerIsWinner ? (
                  <LiveRoomText style={styles.username}>@{celebration.username}</LiveRoomText>
                ) : null}
                <LiveRoomText style={styles.tagline}>{spotCelebrationTagline(celebration.kind)}</LiveRoomText>
              </View>
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.overlay,
  },
  shakeLayer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
  },
  shock: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 40,
    height: 40,
    marginLeft: -20,
    marginTop: -20,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(212, 175, 55, 0.9)',
  },
  shockAlt: {
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  hammer: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -15,
    marginTop: -15,
    transformOrigin: '85% 15%',
  },
  particleLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  spark: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 3,
    height: 10,
    marginLeft: -1.5,
    marginTop: -5,
    borderRadius: 2,
    overflow: 'hidden',
  },
  sparkFill: {
    flex: 1,
  },
  coin: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    overflow: 'hidden',
  },
  cardWrap: {
    width: '100%',
    maxWidth: 360,
  },
  gradientBorder: {
    borderRadius: radii.lg,
    padding: 2,
  },
  cardInner: {
    borderRadius: radii.lg - 2,
    backgroundColor: '#0c0c0e',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg + 4,
    alignItems: 'center',
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  kicker: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  headline: {
    marginTop: spacing.sm,
    color: colors.textPrimary,
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(212, 175, 55, 0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  label: {
    marginTop: spacing.md,
    color: colors.gold,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  username: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  tagline: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
