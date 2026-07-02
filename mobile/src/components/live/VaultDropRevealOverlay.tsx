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
  vaultDropPoolPhaseCopyForSpin,
  vaultDropRevealAccent,
  vaultDropRevealChipColor,
  vaultDropRevealEyebrow,
  vaultDropRevealGivvyWinBanner,
  vaultDropRevealPoolHint,
  vaultDropRevealTiming,
  vaultSealMetaLine,
  vaultSealWinnerCopy,
  GIVVY_REVEAL_BORDER_GRADIENT,
  VAULT_DROP_REEL_PILL_HEIGHT,
  VAULT_DROP_REEL_PILL_BORDER,
  VAULT_DROP_REEL_PILL_SPAN,
  VAULT_DROP_REEL_PILL_WIDTH,
  vaultDropReelCenterOffset,
  vaultDropReelFocusRingPosition,
  type VaultRevealSpinPayload,
} from '../../lib/vaultRevealSpin';
import { colors, radii, spacing } from '../../theme';
import { LIVE_CLAIM_CTA_GRADIENT } from './liveClaimCtaStyle';
import { LiveRoomText } from './LiveRoomText';

type Phase = 'idle' | 'pool' | 'reveal';

function revealAccentColor(spin: VaultRevealSpinPayload): string {
  if (spin.kind === 'random_reveal' || spin.kind === 'break_pyt') {
    return labelAccentColor(spin, spin.winnerIndex);
  }
  return vaultDropRevealAccent(spin);
}

function labelAccentColor(spin: VaultRevealSpinPayload, index: number): string {
  if (spin.kind === 'giveaway') return vaultDropRevealChipColor(spin, index);
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

const REEL_PILL_WIDTH = VAULT_DROP_REEL_PILL_WIDTH;
const REEL_PILL_HEIGHT = VAULT_DROP_REEL_PILL_HEIGHT;
const REEL_PILL_BORDER = VAULT_DROP_REEL_PILL_BORDER;
const REEL_PILL_SPAN = VAULT_DROP_REEL_PILL_SPAN;
const REEL_WINDOW_HEIGHT = REEL_PILL_HEIGHT + 12;

function reelCenterOffset(viewportWidth: number, index: number, span = REEL_PILL_SPAN): number {
  return vaultDropReelCenterOffset(viewportWidth, index, span);
}

const REEL_SPIN_EASING = Easing.bezier(0.12, 0.85, 0.22, 1);

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
  viewerUsername,
  viewerUserId,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
  viewerUsername?: string | null;
  viewerUserId?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const animSpinIdRef = useRef<string | null>(null);
  const reelViewportWidthRef = useRef(0);
  const winnerScrollIndexRef = useRef(0);
  const reelSpanRef = useRef(REEL_PILL_SPAN);

  const [phase, setPhase] = useState<Phase>('idle');
  const [centerScrollIndex, setCenterScrollIndex] = useState(0);
  const [poolProgress, setPoolProgress] = useState(0);
  const [poolPhaseCopy, setPoolPhaseCopy] = useState('Rolling the pool');
  const [reelMeasuredWidth, setReelMeasuredWidth] = useState(0);
  const [reelSpan, setReelSpan] = useState(REEL_PILL_SPAN);

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
      setReelMeasuredWidth(0);
      cardScale.setValue(0.82);
      headlineScale.setValue(1);
      scanY.setValue(0);
      pulse.setValue(0);
      reelX.setValue(0);
      reelBump.setValue(1);
      reelGlow.setValue(0);
    }
  }, [spin?.spinId]);

  useEffect(() => {
    if (!spin?.labels?.length) return;
    if (animSpinIdRef.current === spin.spinId) return;
    if (reelMeasuredWidth <= 0) return;
    animSpinIdRef.current = spin.spinId;

    const { scrollPlan } = vaultDropRevealTiming(spin);
    const { laneStartScroll, spinEndScroll, winnerScrollIndex, spinDurationMs, landDurationMs } = scrollPlan;
    winnerScrollIndexRef.current = winnerScrollIndex;
    setPhase('pool');
    setCenterScrollIndex(laneStartScroll);
    setPoolProgress(0);
    setPoolPhaseCopy(vaultDropPoolPhaseCopyForSpin(spin, 0));
    cardScale.setValue(0.82);
    headlineScale.setValue(1);
    scanY.setValue(0);
    pulse.setValue(0);
    reelBump.setValue(1);
    reelGlow.setValue(0);

    const viewportWidth = reelMeasuredWidth;
    const span = reelSpanRef.current;
    const spinStartX = reelCenterOffset(viewportWidth, laneStartScroll, span);
    const spinEndX = reelCenterOffset(viewportWidth, spinEndScroll, span);
    reelX.setValue(spinStartX);
    reelViewportWidthRef.current = viewportWidth;

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

    const spinDistance = spinStartX - spinEndX;
    let lastHapticIndex = laneStartScroll;
    const progressListenerId = reelX.addListener(({ value }) => {
      if (spinDistance === 0) return;
      const progress = Math.max(0, Math.min(1, (spinStartX - value) / spinDistance));
      setPoolProgress(progress);
      setPoolPhaseCopy(vaultDropPoolPhaseCopyForSpin(spin, progress));
      const currentIndex = laneStartScroll + Math.round((spinStartX - value) / span);
      if (progress > 0.08 && currentIndex !== lastHapticIndex) {
        lastHapticIndex = currentIndex;
        void Haptics.selectionAsync().catch(() => {});
      }
    });

    void (async () => {
      await animateReelTo(reelX, spinEndX, spinDurationMs, REEL_SPIN_EASING);
      reelX.setValue(spinEndX);

      if (cancelled) return;

      scanLoop.stop();
      pulseLoop.stop();
      setCenterScrollIndex(winnerScrollIndex);
      setPoolProgress(1);
      setPoolPhaseCopy('Locked');
      setPhase('reveal');

      await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.min(120, landDurationMs));
      });

      if (cancelled) return;

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

      Animated.sequence([
        Animated.timing(reelBump, {
          toValue: 1.06,
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
      reelX.removeListener(progressListenerId);
      scanLoop.stop();
      pulseLoop.stop();
    };
  }, [spin?.spinId, spin?.labels.length, reelMeasuredWidth, reelSpan]);

  useEffect(() => {
    if (!spin?.spinId || !spin.labels.length) return;
    const { totalMs } = vaultDropRevealTiming(spin);
    const dismissTimer = setTimeout(() => onDismissRef.current(), totalMs);
    return () => clearTimeout(dismissTimer);
  }, [spin?.spinId, spin?.labels.length, spin?.winnerIndex]);

  const onReelSlotLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0 || Math.abs(width - reelSpanRef.current) <= 0.5) return;
    reelSpanRef.current = width;
    setReelSpan(width);
  };

  const onReelLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0) return;
    reelViewportWidthRef.current = width;
    setReelMeasuredWidth((prev) => (Math.abs(prev - width) > 1 ? width : prev));
    if (phase === 'pool') return;
    if (spin) {
      const scrollIdx = reelDisplayScrollIndex(phase, centerScrollIndex, winnerScrollIndexRef.current);
      reelX.setValue(reelCenterOffset(width, scrollIdx, reelSpanRef.current));
    }
  };

  if (!spin || spin.labels.length === 0) return null;

  const winner = vaultSealWinnerCopy(spin);
  const eyebrow = vaultDropRevealEyebrow(spin);
  const poolHint = vaultDropRevealPoolHint(spin);
  const isGivvyDraw = spin.kind === 'giveaway';
  const borderGradient = isGivvyDraw ? GIVVY_REVEAL_BORDER_GRADIENT : LIVE_CLAIM_CTA_GRADIENT;
  const givvyWinBanner = showWinner
    ? vaultDropRevealGivvyWinBanner(spin, { userId: viewerUserId, username: viewerUsername })
    : null;
  const scanTranslate = scanY.interpolate({ inputRange: [0, 1], outputRange: [-120, 120] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });
  const reelGlowOpacity = reelGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const focusRing = vaultDropReelFocusRingPosition(reelMeasuredWidth, REEL_WINDOW_HEIGHT);

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
            { backgroundColor: `${showWinner ? accent : isGivvyDraw ? '#34d399' : colors.gold}33`, opacity: pulseOpacity },
          ]}
        />

        <Pressable onPress={() => {}} style={styles.cardPressGuard}>
        <Animated.View style={[styles.cardWrap, { transform: [{ scale: cardScale }] }]}>
          <LinearGradient colors={[...borderGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientBorder}>
            <View style={styles.cardInner}>
              <LiveRoomText style={[styles.eyebrow, isGivvyDraw && styles.givvyEyebrow]}>{eyebrow}</LiveRoomText>
              <LiveRoomText style={styles.showTitle} numberOfLines={2}>
                {spin.title}
              </LiveRoomText>
              <LiveRoomText style={styles.meta}>{vaultSealMetaLine(spin)}</LiveRoomText>
              <LiveRoomText style={[styles.fairness, isGivvyDraw && styles.givvyFairness]}>
                Verified server draw · everyone sees the same roll
              </LiveRoomText>

              <View style={styles.poolBlock}>
                <LiveRoomText style={[styles.poolKicker, isGivvyDraw && styles.givvyPoolKicker]}>
                  {showWinner ? winner.kicker : poolPhaseCopy}
                </LiveRoomText>
                {!showWinner ? (
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        isGivvyDraw && styles.givvyProgressFill,
                        { width: `${Math.round(poolProgress * 100)}%` },
                      ]}
                    />
                  </View>
                ) : null}

                <View style={styles.reelFrame}>
                  <View style={styles.reelWindow} onLayout={onReelLayout} pointerEvents="none">
                    <Animated.View style={[styles.reelTrack, { transform: [{ translateX: reelX }] }]}>
                      {reelLaneLabels.map((label, index) => {
                        const sourceIndex = labelCount > 0 ? index % labelCount : 0;
                        const chipAccent = labelAccentColor(spin, sourceIndex);
                        const lightChip = isLightSpotAccent(chipAccent);
                        const isWinnerSlot = showWinner && index === centerScrollIndex;
                        return (
                          <View
                            key={`${label}-${index}`}
                            style={styles.reelSlot}
                            onLayout={index === 0 ? onReelSlotLayout : undefined}
                          >
                            <Animated.View
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
                          </View>
                        );
                      })}
                    </Animated.View>
                    <View
                      style={[
                        styles.reelFocusRing,
                        isGivvyDraw && styles.givvyFocusRing,
                        {
                          left: focusRing.left,
                          top: focusRing.top,
                          width: focusRing.width,
                          height: focusRing.height,
                        },
                      ]}
                      pointerEvents="none"
                    />
                  </View>
                  <LinearGradient
                    colors={['#0a0a0c', 'rgba(10,10,12,0)', 'rgba(10,10,12,0)', '#0a0a0c']}
                    locations={[0, 0.14, 0.86, 1]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.reelEdgeFade}
                    pointerEvents="none"
                  />
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
                    {givvyWinBanner ? (
                      <LiveRoomText style={styles.givvyWinBanner}>{givvyWinBanner}</LiveRoomText>
                    ) : null}
                    <LiveRoomText style={[styles.winnerTeam, { color: accent }]} numberOfLines={2}>
                      {winner.primary}
                    </LiveRoomText>
                    {winner.sub ? <LiveRoomText style={styles.winnerSub}>{winner.sub}</LiveRoomText> : null}
                    {winner.detail ? <LiveRoomText style={styles.winnerDetail}>{winner.detail}</LiveRoomText> : null}
                  </Animated.View>
                ) : (
                  <LiveRoomText style={styles.reelHint}>{poolHint}</LiveRoomText>
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
  givvyEyebrow: {
    color: '#6ee7b7',
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
  givvyFairness: {
    color: 'rgba(110,231,183,0.82)',
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
  givvyPoolKicker: {
    color: 'rgba(110,231,183,0.92)',
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
  givvyProgressFill: {
    backgroundColor: '#34d399',
  },
  reelFrame: {
    width: '100%',
    marginTop: spacing.xs,
    position: 'relative',
  },
  reelWindow: {
    width: '100%',
    height: REEL_WINDOW_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  reelTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    height: REEL_WINDOW_HEIGHT,
  },
  reelSlot: {
    width: REEL_PILL_SPAN,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reelPill: {
    width: REEL_PILL_WIDTH,
    height: REEL_PILL_HEIGHT,
    flexShrink: 0,
    borderRadius: radii.pill,
    borderWidth: REEL_PILL_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  reelPillWinner: {
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
    borderRadius: radii.pill,
    borderWidth: REEL_PILL_BORDER,
    borderColor: 'rgba(255,215,120,0.85)',
    backgroundColor: 'transparent',
  },
  givvyFocusRing: {
    borderColor: 'rgba(110,231,183,0.88)',
  },
  reelEdgeFade: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.pill,
  },
  reelWinnerGlow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -(REEL_PILL_WIDTH / 2) - 10,
    marginTop: -(REEL_PILL_HEIGHT / 2) - 10,
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
  givvyWinBanner: {
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    color: '#6ee7b7',
    marginBottom: spacing.sm,
    letterSpacing: 0.2,
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
