import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { logBidControl } from '../../lib/bidControlLog';
import { vaultColors } from '../../theme/vaultColors';
import { LiveRoomText } from './LiveRoomText';

/** Swipe must cross this fraction of the track to commit; short of it snaps back. */
const COMMIT_THRESHOLD = 0.82;
const THUMB_SIZE = 40;
const THUMB_SIZE_COMPACT = 36;
const TRACK_INSET = 3;
const RIPPLE_SIZE = 14;

/** Machined-metal handle gradients — warm gold for buy-now, cool violet for the auction bid. */
const GOLD_THUMB_GRADIENT = ['#f4e3b6', '#cba35c', '#8a6a34'] as const;
const AUCTION_THUMB_GRADIENT = ['#f0d9ff', '#a06be0', '#5b3aa0'] as const;

/** Faint ambient color wash over the frosted-glass track — not a solid fill, just a tint. */
const GOLD_TRACK_TINT = ['rgba(203,163,92,0.38)', 'rgba(203,163,92,0)'] as const;
const AUCTION_TRACK_TINT = ['rgba(217,70,239,0.32)', 'rgba(139,92,246,0.18)', 'rgba(99,102,241,0.32)'] as const;

/** Bid ACK in flight — not payment. Settlement charges when the auction timer ends. */
const PROCESSING_LABEL = 'Placing bid…';

type Props = {
  label: string;
  disabled?: boolean;
  /** Network in flight — shows Placing bid… and blocks new swipes until cleared. */
  busy?: boolean;
  onCommit: () => void;
  /** Return false to abort the swipe (e.g. auth required). Checked at the start of each drag. */
  onHoldStart?: () => boolean | void;
  /** Purple live-feed bid styling vs default gold. */
  variant?: 'gold' | 'auction';
  compact?: boolean;
};

/** Slide-to-confirm bid/buy control — drag the handle across the track to commit. */
export function SlideToBidButton({
  label,
  disabled = false,
  busy = false,
  onCommit,
  onHoldStart,
  variant = 'gold',
  compact = false,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const thumbSize = compact ? THUMB_SIZE_COMPACT : THUMB_SIZE;
  const maxTranslate = Math.max(0, trackWidth - thumbSize - TRACK_INSET * 2);

  const translateX = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const gateOk = useSharedValue(false);
  const committedRef = useRef(false);

  /** One-shot burst at the handle's resting spot the instant a swipe commits. */
  const rippleProgress = useSharedValue(0);

  /** Gentle vault-gold halo pulse on the primary auction bid CTA (iOS shadow only — Android's
   * elevation shadow doesn't blur the same way, matching this button's existing iOS-only glow). */
  const glowPulse = useSharedValue(0);

  useEffect(() => {
    if (variant !== 'auction' || disabled || Platform.OS !== 'ios') {
      glowPulse.value = 0;
      return undefined;
    }
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => {
      glowPulse.value = 0;
    };
  }, [variant, disabled, glowPulse]);

  const showGlow = variant === 'auction' && !disabled && Platform.OS === 'ios';
  const showProcessing = busy && !disabled;

  const snapBack = useCallback((reason: string) => {
    committedRef.current = false;
    logBidControl('reset', { reason });
    translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
  }, [translateX]);

  // Disabled/busy can flip out from under an in-progress or resting drag (e.g. bid ACK lands,
  // or the lot closes) — always snap the handle back to the start in that case.
  useEffect(() => {
    if (disabled || busy) {
      committedRef.current = false;
      translateX.value = withTiming(0, { duration: 140 });
    }
  }, [disabled, busy, translateX]);

  const checkGate = useCallback(() => {
    gateOk.value = false;
    if (disabled || busy || committedRef.current) return;
    const allowed = onHoldStart?.();
    if (allowed === false) {
      logBidControl('blocked', { reason: 'gate rejected swipe' });
      gateOk.value = false;
      return;
    }
    logBidControl('press', { label });
    gateOk.value = true;
  }, [busy, disabled, gateOk, label, onHoldStart]);

  const commit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    logBidControl('commit', { label });
    rippleProgress.value = 0;
    rippleProgress.value = withTiming(1, { duration: 550, easing: Easing.out(Easing.cubic) });
    onCommit();
  }, [label, onCommit, rippleProgress]);

  const pan = Gesture.Pan()
    .enabled(!disabled && !busy)
    // Tuned tighter than the outer immersive-chrome swipe-to-hide gesture's ~18px horizontal
    // threshold (see useLiveImmersiveChrome.ts's `pan`, composed above this control in
    // VerticalLiveFeed.tsx). Nested GestureDetectors don't get an implicit priority relationship
    // just from view nesting, so this claims a horizontal drag that starts on the track before
    // that ancestor gesture reaches its own threshold. failOffsetY cedes fast on a mostly-vertical
    // touch, which this control never needs anyway.
    .activeOffsetX([-8, 8])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      'worklet';
      dragStartX.value = translateX.value;
      gateOk.value = false;
      runOnJS(checkGate)();
    })
    .onUpdate((e) => {
      'worklet';
      if (!gateOk.value) return;
      const next = dragStartX.value + e.translationX;
      translateX.value = Math.min(Math.max(next, 0), maxTranslate);
    })
    .onEnd(() => {
      'worklet';
      if (!gateOk.value) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
        return;
      }
      const progress = maxTranslate > 0 ? translateX.value / maxTranslate : 0;
      if (progress >= COMMIT_THRESHOLD) {
        translateX.value = withTiming(maxTranslate, { duration: 120 });
        runOnJS(commit)();
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
        runOnJS(snapBack)('release_early');
      }
    });

  const handleLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const fillAnimatedStyle = useAnimatedStyle(() => ({
    width: translateX.value + thumbSize + TRACK_INSET,
  }));
  const labelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: maxTranslate > 0 ? 1 - Math.min(1, (translateX.value / maxTranslate) * 1.4) : 1,
  }));
  const glowAnimatedStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.32 + glowPulse.value * 0.3,
    shadowRadius: 8 + glowPulse.value * 8,
  }));
  const rippleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(rippleProgress.value, [0, 0.15, 1], [0, 0.85, 0]),
    transform: [
      { translateX: maxTranslate + thumbSize / 2 - RIPPLE_SIZE / 2 },
      { scale: interpolate(rippleProgress.value, [0, 1], [0.4, 9]) },
    ],
  }));

  const auction = variant === 'auction';
  const indicatorColor = auction ? '#fff' : '#0a0a0a';

  const runAccessibleCommit = useCallback(() => {
    checkGate();
    // checkGate sets gateOk synchronously on the JS thread here (no worklet involved), so it's
    // safe to read it back immediately for the assistive-tech fallback path below.
    if (gateOk.value) {
      translateX.value = withTiming(maxTranslate, { duration: 120 });
      commit();
    }
  }, [checkGate, commit, gateOk, maxTranslate, translateX]);

  return (
    <Animated.View
      style={[
        compact ? styles.glowWrapCompact : styles.glowWrap,
        showGlow && { shadowColor: vaultColors.gold, shadowOffset: { width: 0, height: 0 } },
        showGlow && glowAnimatedStyle,
      ]}
    >
      <GestureDetector gesture={pan}>
        <View
          onLayout={handleLayout}
          style={[
            styles.track,
            auction && styles.trackAuction,
            compact && styles.trackCompact,
            disabled && styles.trackDisabled,
            disabled && auction && styles.trackAuctionDisabled,
            showProcessing && styles.trackBusy,
          ]}
          accessibilityRole="button"
          accessibilityLabel={showProcessing ? PROCESSING_LABEL : label}
          accessibilityHint="Swipe right to confirm"
          accessibilityState={{ disabled: disabled || busy }}
          accessibilityActions={[{ name: 'activate', label: 'Confirm' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'activate') runAccessibleCommit();
          }}
        >
          {!disabled ? (
            <BlurView
              intensity={30}
              tint="dark"
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
          ) : null}

          {!disabled ? (
            <LinearGradient
              colors={auction ? [...AUCTION_TRACK_TINT] : [...GOLD_TRACK_TINT]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
          ) : null}

          {!disabled ? (
            <Animated.View style={[styles.fill, fillAnimatedStyle]} pointerEvents="none">
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.14)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject}
              />
            </Animated.View>
          ) : null}

          {!disabled ? (
            <Animated.View
              style={[
                styles.ripple,
                rippleAnimatedStyle,
                { backgroundColor: auction ? 'rgba(139,92,246,0.55)' : 'rgba(203,163,92,0.55)' },
              ]}
              pointerEvents="none"
            />
          ) : null}

          {showProcessing ? (
            <View style={styles.processingRow} pointerEvents="none">
              <ActivityIndicator color={indicatorColor} size="small" />
              <LiveRoomText style={[styles.label, auction && styles.labelAuction]} numberOfLines={1}>
                {PROCESSING_LABEL}
              </LiveRoomText>
            </View>
          ) : (
            <Animated.View style={[styles.labelWrap, labelAnimatedStyle]} pointerEvents="none">
              <LiveRoomText
                style={[
                  styles.label,
                  auction && styles.labelAuction,
                  disabled && (auction ? styles.labelAuctionDisabled : styles.labelDisabled),
                ]}
                numberOfLines={1}
              >
                {label}
              </LiveRoomText>
            </Animated.View>
          )}

          {!showProcessing ? (
            <Animated.View
              style={[
                styles.thumb,
                compact && styles.thumbCompact,
                !disabled && {
                  shadowColor: auction ? '#8B5CF6' : vaultColors.gold,
                  shadowOpacity: 0.4,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 3 },
                },
                thumbAnimatedStyle,
              ]}
              pointerEvents="none"
            >
              {/* Shadow lives on this outer view; overflow is clipped one layer in so the
                  rounded drop shadow isn't cut off along with the gradient fill. */}
              <View
                style={[
                  styles.thumbInner,
                  compact && styles.thumbInnerCompact,
                  disabled && styles.thumbDisabled,
                ]}
              >
                {!disabled ? (
                  <LinearGradient
                    colors={auction ? [...AUCTION_THUMB_GRADIENT] : [...GOLD_THUMB_GRADIENT]}
                    start={{ x: 0.25, y: 0.1 }}
                    end={{ x: 0.8, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                ) : null}
                {!disabled ? <View style={styles.thumbHighlight} /> : null}
              </View>
              <Ionicons
                name="chevron-forward"
                size={compact ? 16 : 18}
                color={disabled ? 'rgba(255,255,255,0.45)' : auction ? '#fff' : 'rgba(0,0,0,0.55)'}
              />
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // No borderRadius here on purpose (see glowAnimatedStyle above): this view carries the
  // pulsing shadow (shadowOpacity/shadowRadius looping via glowPulse for as long as the button
  // is enabled, i.e. basically the whole auction) and doesn't clip anything itself - `track`
  // one level in already does the actual rounded clip via its own static borderRadius/overflow.
  // A nonzero borderRadius here used to make RN treat every glow-pulse frame as a border-metrics
  // change, forcing a synchronous CPU re-rasterization via RCTGetBorderImage on the main thread
  // for the animation's whole 60fps duration (GET-VAULTED-MOBILE-H, "Fatal App Hang" watchdog
  // kill). Dropping it removes the trigger with no visual change, since nothing was actually
  // being clipped to it.
  glowWrap: {
    flex: 1,
  },
  glowWrapCompact: {
    flex: 1,
  },
  track: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(14,12,9,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  trackAuction: {
    borderColor: 'rgba(255,255,255,0.14)',
  },
  trackCompact: {
    minHeight: 40,
  },
  trackBusy: {
    opacity: 0.92,
  },
  trackDisabled: {
    opacity: 0.45,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
    shadowOpacity: 0,
    elevation: 0,
  },
  trackAuctionDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  labelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#f1ebdd',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.15,
    textTransform: 'uppercase',
  },
  labelDisabled: {
    color: 'rgba(255,255,255,0.4)',
  },
  labelAuction: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  labelAuctionDisabled: {
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'none',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  thumb: {
    position: 'absolute',
    left: TRACK_INSET,
    top: TRACK_INSET,
    bottom: TRACK_INSET,
    width: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbCompact: {
    width: THUMB_SIZE_COMPACT,
    borderRadius: THUMB_SIZE_COMPACT / 2,
  },
  // Fills the outer `thumb` view exactly. Clipping (overflow/borderRadius) lives here, one
  // layer in from the shadow, so the drop shadow on `thumb` doesn't get clipped along with it.
  thumbInner: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
  },
  thumbInnerCompact: {
    borderRadius: THUMB_SIZE_COMPACT / 2,
  },
  thumbDisabled: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  thumbHighlight: {
    position: 'absolute',
    top: '15%',
    left: '20%',
    width: '32%',
    height: '22%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  ripple: {
    position: 'absolute',
    top: '50%',
    left: 0,
    width: RIPPLE_SIZE,
    height: RIPPLE_SIZE,
    marginTop: -RIPPLE_SIZE / 2,
    borderRadius: RIPPLE_SIZE / 2,
  },
});
