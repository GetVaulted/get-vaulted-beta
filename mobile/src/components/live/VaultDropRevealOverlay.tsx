import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLightSpotAccent, NFL_DIVISION_COLORS, spotAccentColor } from '../../lib/liveBreakPresets';
import {
  buildVaultDropReelLane,
  reelStepAnimationMs,
  vaultDropPoolPhaseCopy,
  vaultDropReelLaneStartScrollIndex,
  vaultDropRevealEyebrow,
  vaultDropRevealTiming,
  vaultSealMetaLine,
  vaultSealWinnerCopy,
  type VaultRevealSpinPayload,
} from '../../lib/vaultRevealSpin';
import { colors, radii, spacing } from '../../theme';
import { LIVE_CLAIM_CTA_GRADIENT } from './liveClaimCtaStyle';
import { LiveRoomText } from './LiveRoomText';

type Phase = 'idle' | 'pool' | 'reveal';

function revealAccentColor(spin: VaultRevealSpinPayload): string {
  return labelAccentColor(spin, spin.winnerIndex);
}

function labelAccentColor(spin: VaultRevealSpinPayload, index: number): string {
  if (spin.kind === 'giveaway') return colors.gold;
  const label = spin.labels[index]?.trim() ?? '';
  const abbr = spin.segmentAbbrs?.[index]?.trim();
  const isDivision = Boolean(NFL_DIVISION_COLORS[label]);
  return spotAccentColor(label, abbr, isDivision);
}

function shortPoolLabel(label: string): string {
  const t = label.trim();
  if (t.length <= 14) return t;
  return `${t.slice(0, 13)}…`;
}

const REEL_PILL_WIDTH = 84;
const REEL_PILL_GAP = 6;
const REEL_PILL_HEIGHT = 40;
const REEL_PILL_SPAN = REEL_PILL_WIDTH + REEL_PILL_GAP;

function reelCenterOffset(viewportWidth: number, index: number): number {
  return viewportWidth / 2 - REEL_PILL_WIDTH / 2 - index * REEL_PILL_SPAN;
}

function reelStepEasing(progress: number, landing: boolean): (value: number) => number {
  if (landing) return Easing.out(Easing.cubic);
  if (progress < 0.72) return Easing.linear;
  if (progress < 0.92) return Easing.out(Easing.quad);
  return Easing.out(Easing.cubic);
}

function animateReelTo(
  reelX: Animated.Value,
  toValue: number,
  durationMs: number,
  easing: (value: number) => number,
): Promise<void> {
  return new Promise((resolve) => {
    Animated.timing(reelX, {
      toValue,
      duration: durationMs,
      easing,
      useNativeDriver: true,
    }).start(() => resolve());
  });
}

function reelDisplayScrollIndex(phase: Phase, centerScrollIndex: number, winnerScrollIndex: number): number {
  if (phase === 'reveal') return winnerScrollIndex;
  return centerScrollIndex;
}

export function VaultDropRevealOverlay({
  spin,
  onDismiss,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const animSpinIdRef = useRef<string | null>(null);
  const reelViewportWidthRef = useRef(280);
  const winnerScrollIndexRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('idle');
  const [cycleIndex, setCycleIndex] = useState(0);
  const [centerScrollIndex, setCenterScrollIndex] = useState(0);
  const [poolProgress, setPoolProgress] = useState(0);
  const [poolPhaseCopy, setPoolPhaseCopy] = useState('Rolling the pool');
  const [reelViewportWidth, setReelViewportWidth] = useState(280);

  const cardScale = useRef(new Animated.Value(0.82)).current;
  const headlineScale = useRef(new Animated.Value(1)).current;
  const scanY = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const reelX = useRef(new Animated.Value(0)).current;
  const reelBump = useRef(new Animated.Value(1)).current;
  const reelGlow = useRef(new Animated.Value(0)).current;
  const reelAnimRef = useRef<{ cancel: () => void } | null>(null);

  const accent = useMemo(() => (spin ? revealAccentColor(spin) : colors.gold), [spin]);
  const reelLaneLabels = useMemo(() => (spin ? buildVaultDropReelLane(spin.labels) : []), [spin?.labels]);
  const labelCount = spin?.labels.length ?? 0;
  const showWinner = phase === 'reveal';

  useEffect(() => {
    if (!spin) {
      animSpinIdRef.current = null;
      setPhase('idle');
      cardScale.setValue(0.82);
      headlineScale.setValue(1);
      scanY.setValue(0);
      pulse.setValue(0);
      reelX.setValue(0);
      reelBump.setValue(1);
      reelGlow.setValue(0);
      return;
    }
    if (animSpinIdRef.current === spin.spinId) return;
    animSpinIdRef.current = spin.spinId;

    const { steps } = vaultDropRevealTiming(spin);
    const laneStartScroll = vaultDropReelLaneStartScrollIndex(spin.labels.length, steps[0]?.labelIndex ?? 0);
    const winnerScrollIndex = laneStartScroll + steps.length;
    winnerScrollIndexRef.current = winnerScrollIndex;
    setPhase('pool');
    setCycleIndex(steps[0]?.labelIndex ?? 0);
    setCenterScrollIndex(laneStartScroll);
    setPoolProgress(0);
    setPoolPhaseCopy(vaultDropPoolPhaseCopy(0));
    cardScale.setValue(0.82);
    headlineScale.setValue(1);
    scanY.setValue(0);
    pulse.setValue(0);
    reelBump.setValue(1);
    reelGlow.setValue(0);
    reelX.setValue(reelCenterOffset(reelViewportWidthRef.current, laneStartScroll));

    const animateReelToScroll = async (scrollIndex: number, progress: number, landing: boolean, delayMs: number) => {
      const durationMs = reelStepAnimationMs(progress, landing, delayMs);
      setCenterScrollIndex(scrollIndex);
      await animateReelTo(
        reelX,
        reelCenterOffset(reelViewportWidthRef.current, scrollIndex),
        durationMs,
        reelStepEasing(progress, landing),
      );
    };

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const scanLoop = Animated.loop(
      Animated.timing(scanY, {
        toValue: 1,
        duration: 680,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]),
    );
    scanLoop.start();
    pulseLoop.start();

    let cancelled = false;
    reelAnimRef.current = {
      cancel: () => {
        cancelled = true;
      },
    };

    void (async () => {
      for (let stepIdx = 1; stepIdx < steps.length; stepIdx += 1) {
        if (cancelled) return;
        const step = steps[stepIdx]!;
        const progress = stepIdx / Math.max(1, steps.length - 1);
        setCycleIndex(step.labelIndex);
        setPoolProgress(progress);
        setPoolPhaseCopy(vaultDropPoolPhaseCopy(progress));
        if (progress > 0.55 && stepIdx % 2 === 0) {
          void Haptics.selectionAsync().catch(() => {});
        }
        await animateReelToScroll(laneStartScroll + stepIdx, progress, false, step.delayMs);
      }

      if (cancelled) return;

      scanLoop.stop();
      pulseLoop.stop();
      setPhase('reveal');
      setCycleIndex(spin.winnerIndex);
      setPoolProgress(1);
      setPoolPhaseCopy('Locked');
      await animateReelToScroll(winnerScrollIndex, 1, true, 0);

      if (cancelled) return;

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

      Animated.sequence([
        Animated.timing(reelBump, {
          toValue: 1.12,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(reelBump, {
          toValue: 1,
          friction: 5,
          tension: 120,
          useNativeDriver: true,
        }),
      ]).start();

      Animated.timing(reelGlow, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();

      Animated.spring(cardScale, {
        toValue: 1,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }).start();

      Animated.sequence([
        Animated.timing(headlineScale, {
          toValue: 1.08,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(headlineScale, {
          toValue: 1,
          duration: 220,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    })();

    return () => {
      cancelled = true;
      reelAnimRef.current?.cancel();
      scanLoop.stop();
      pulseLoop.stop();
    };
  }, [spin?.spinId]);

  useEffect(() => {
    if (!spin?.spinId) return;
    const { totalMs } = vaultDropRevealTiming(spin);
    const dismissTimer = setTimeout(() => onDismissRef.current(), totalMs);
    return () => clearTimeout(dismissTimer);
  }, [spin?.spinId, spin?.labels.length, spin?.winnerIndex]);

  const onReelLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0) return;
    reelViewportWidthRef.current = width;
    if (Math.abs(width - reelViewportWidth) > 1) {
      setReelViewportWidth(width);
      if (spin) {
        const scrollIdx = reelDisplayScrollIndex(phase, centerScrollIndex, winnerScrollIndexRef.current);
        reelX.setValue(reelCenterOffset(width, scrollIdx));
      }
    }
  };

  if (!spin) return null;

  const winner = vaultSealWinnerCopy(spin);
  const eyebrow = vaultDropRevealEyebrow(spin.kind);
  const scanTranslate = scanY.interpolate({ inputRange: [0, 1], outputRange: [-120, 120] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });
  const reelGlowOpacity = reelGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onDismiss}>
      <Pressable
        style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        onPress={onDismiss}
        accessibilityLabel="Dismiss reveal"
      >
        <View style={styles.vignetteTop} pointerEvents="none" />
        <View style={styles.vignetteBottom} pointerEvents="none" />

        <Animated.View style={[styles.scan, { transform: [{ translateY: scanTranslate }] }]} pointerEvents="none" />

        <Animated.View
          style={[
            styles.glow,
            { backgroundColor: `${showWinner ? accent : colors.gold}33`, opacity: pulseOpacity },
          ]}
        />

        <Pressable onPress={() => {}} style={styles.cardPressGuard}>
        <Animated.View style={[styles.cardWrap, { transform: [{ scale: cardScale }] }]}>
          <LinearGradient colors={[...LIVE_CLAIM_CTA_GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientBorder}>
            <View style={styles.cardInner}>
              <LiveRoomText style={styles.eyebrow}>{eyebrow}</LiveRoomText>
              <LiveRoomText style={styles.showTitle} numberOfLines={2}>
                {spin.title}
              </LiveRoomText>
              <LiveRoomText style={styles.meta}>{vaultSealMetaLine(spin)}</LiveRoomText>
              <LiveRoomText style={styles.fairness}>Verified server draw · everyone sees the same roll</LiveRoomText>

              <View style={styles.poolBlock}>
                <LiveRoomText style={styles.poolKicker}>
                  {showWinner ? winner.kicker : poolPhaseCopy}
                </LiveRoomText>
                {!showWinner ? (
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.round(poolProgress * 100)}%` }]} />
                  </View>
                ) : null}

                <View style={styles.reelFrame} onLayout={onReelLayout}>
                  <View style={styles.reelWindow} pointerEvents="none">
                    <Animated.View style={[styles.reelTrack, { transform: [{ translateX: reelX }] }]}>
                      {reelLaneLabels.map((label, index) => {
                        const sourceIndex = labelCount > 0 ? index % labelCount : 0;
                        const chipAccent = labelAccentColor(spin, sourceIndex);
                        const lightChip = isLightSpotAccent(chipAccent);
                        const isWinnerSlot = showWinner && index === centerScrollIndex;
                        return (
                          <Animated.View
                            key={`${label}-${index}`}
                            style={[
                              styles.reelPill,
                              {
                                backgroundColor: lightChip ? `${chipAccent}ee` : `${chipAccent}44`,
                                borderColor: chipAccent,
                                transform: isWinnerSlot ? [{ scale: reelBump }] : undefined,
                              },
                              isWinnerSlot && styles.reelPillWinner,
                            ]}
                          >
                            <LiveRoomText
                              style={[
                                styles.reelPillTxt,
                                { color: lightChip ? '#111' : '#fff' },
                                isWinnerSlot && styles.reelPillTxtWinner,
                              ]}
                              numberOfLines={1}
                            >
                              {shortPoolLabel(label)}
                            </LiveRoomText>
                          </Animated.View>
                        );
                      })}
                    </Animated.View>
                  </View>
                  <LinearGradient
                    colors={['#0a0a0c', 'rgba(10,10,12,0)', 'rgba(10,10,12,0)', '#0a0a0c']}
                    locations={[0, 0.14, 0.86, 1]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.reelEdgeFade}
                    pointerEvents="none"
                  />
                  <View style={styles.reelFocusRing} pointerEvents="none" />
                  {showWinner ? (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.reelWinnerGlow,
                        { backgroundColor: `${accent}55`, opacity: reelGlowOpacity },
                      ]}
                    />
                  ) : null}
                </View>

                {showWinner ? (
                  <Animated.View style={{ transform: [{ scale: headlineScale }], width: '100%' }}>
                    <LiveRoomText style={[styles.winnerTeam, { color: accent }]} numberOfLines={2}>
                      {winner.primary}
                    </LiveRoomText>
                    {winner.sub ? <LiveRoomText style={styles.winnerSub}>{winner.sub}</LiveRoomText> : null}
                    {winner.detail ? <LiveRoomText style={styles.winnerDetail}>{winner.detail}</LiveRoomText> : null}
                  </Animated.View>
                ) : (
                  <LiveRoomText style={styles.reelHint}>Team reel slows down and locks on your draw</LiveRoomText>
                )}
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
        </Pressable>

        <Pressable style={styles.skipBtn} onPress={onDismiss} hitSlop={12}>
          <LiveRoomText style={styles.skipTxt}>{showWinner ? 'Continue' : 'Skip'}</LiveRoomText>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  vignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '35%',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  vignetteBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '35%',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  scan: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,215,120,0.55)',
    shadowColor: colors.gold,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  glow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  cardPressGuard: {
    width: '100%',
    maxWidth: 380,
  },
  cardWrap: {
    width: '100%',
  },
  gradientBorder: {
    borderRadius: radii.lg,
    padding: 2,
  },
  cardInner: {
    borderRadius: radii.lg - 2,
    backgroundColor: '#0a0a0c',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg + 6,
    alignItems: 'center',
    overflow: 'hidden',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.8,
    textTransform: 'uppercase',
    color: colors.gold,
    textAlign: 'center',
  },
  showTitle: {
    marginTop: spacing.sm,
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  meta: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
  },
  fairness: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,215,120,0.72)',
    textAlign: 'center',
  },
  poolBlock: {
    marginTop: spacing.md,
    width: '100%',
    gap: spacing.sm,
    alignItems: 'center',
  },
  poolKicker: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(255,215,120,0.92)',
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.gold,
  },
  reelFrame: {
    width: '100%',
    marginTop: spacing.xs,
    position: 'relative',
  },
  reelWindow: {
    width: '100%',
    height: REEL_PILL_HEIGHT + 12,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  reelTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reelPill: {
    width: REEL_PILL_WIDTH,
    height: REEL_PILL_HEIGHT,
    marginRight: REEL_PILL_GAP,
    flexShrink: 0,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  reelPillWinner: {
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  reelPillTxt: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 13,
  },
  reelPillTxtWinner: {
    fontSize: 12,
    fontWeight: '900',
  },
  reelFocusRing: {
    position: 'absolute',
    top: 4,
    left: '50%',
    marginLeft: -(REEL_PILL_WIDTH / 2) - 4,
    width: REEL_PILL_WIDTH + 8,
    height: REEL_PILL_HEIGHT + 4,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: 'rgba(255,215,120,0.72)',
    backgroundColor: 'rgba(255,215,120,0.06)',
  },
  reelEdgeFade: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.pill,
  },
  reelWinnerGlow: {
    position: 'absolute',
    top: -6,
    left: '50%',
    marginLeft: -(REEL_PILL_WIDTH / 2) - 10,
    width: REEL_PILL_WIDTH + 20,
    height: REEL_PILL_HEIGHT + 20,
    borderRadius: radii.pill,
  },
  reelHint: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.42)',
    textAlign: 'center',
  },
  winnerTeam: {
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginTop: spacing.xs,
  },
  winnerSub: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  winnerDetail: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
  },
  skipBtn: {
    marginTop: spacing.lg,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  skipTxt: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
});
