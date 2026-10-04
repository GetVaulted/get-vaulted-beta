import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { logBidControl } from '../../lib/bidControlLog';
import { vaultColors } from '../../theme/vaultColors';
import { vaultFonts } from '../../theme/vaultTypography';
import { LiveRoomText } from './LiveRoomText';

/** Swipe must cross this fraction of the track to commit; short of it snaps back.
 * Was 0.82 — logs showed ~85% of slide attempts snapping back (buyers stopping short or drifting
 * off-axis), which read to buyers as "it won't let me bid". */
const COMMIT_THRESHOLD = 0.62;
/** A quick rightward flick commits even when it hasn't travelled the full threshold. */
const FLING_MIN_PROGRESS = 0.3;
const FLING_MIN_VELOCITY_X = 700;
/** A touch that barely moves is a tap, not a slide — nudge the handle to show how it works. */
const TAP_NUDGE_MAX_PROGRESS = 0.12;
const THUMB_SIZE = 40;
const THUMB_SIZE_COMPACT = 26;
const TRACK_INSET = 3;

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
  /** Both variants render the same brass-gold "Minimal Flat" style — kept as separate values
   * since callers use it to pick bid vs. buy-now copy/semantics elsewhere, not a color anymore. */
  variant?: 'gold' | 'auction';
  compact?: boolean;
};

/** Slide-to-confirm bid/buy control — drag the handle across the track to commit.
 *
 * "Minimal Flat" style (Vault Console Redesign): a thin flat pill, no gradients, no blur, no
 * glow — matches the approved live-room mockup. See vaultColors/vaultTypography for the shared
 * brass-gold + type tokens this pulls from. */
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

  const showProcessing = busy && !disabled;

  const snapBack = useCallback((reason: string, progress?: number) => {
    committedRef.current = false;
    logBidControl('reset', {
      reason,
      ...(typeof progress === 'number' ? { progress: Math.round(progress * 100) / 100 } : {}),
    });
    translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
  }, [translateX]);

  // Log-only (does not reset translateX, which would cancel the nudge animation).
  const logTapNudge = useCallback((progress: number) => {
    logBidControl('reset', { reason: 'tap_nudge', progress: Math.round(progress * 100) / 100 });
  }, []);

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
    onCommit();
  }, [label, onCommit]);

  const pan = Gesture.Pan()
    .enabled(!disabled && !busy)
    // Tuned tighter than the outer immersive-chrome swipe-to-hide gesture's ~18px horizontal
    // threshold (see useLiveImmersiveChrome.ts's `pan`, composed above this control in
    // VerticalLiveFeed.tsx). Nested GestureDetectors don't get an implicit priority relationship
    // just from view nesting, so this claims a horizontal drag that starts on the track before
    // that ancestor gesture reaches its own threshold. failOffsetY cedes fast on a mostly-vertical
    // touch, which this control never needs anyway.
    .activeOffsetX([-8, 8])
    // Was ±14px: a slightly diagonal thumb path failed the slide (and handed the touch to the
    // vertical pager). A bid slide drifts vertically more than that on a real phone.
    .failOffsetY([-28, 28])
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
    .onEnd((e) => {
      'worklet';
      if (!gateOk.value) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
        return;
      }
      const progress = maxTranslate > 0 ? translateX.value / maxTranslate : 0;
      const flung = progress >= FLING_MIN_PROGRESS && e.velocityX >= FLING_MIN_VELOCITY_X;
      if (progress >= COMMIT_THRESHOLD || flung) {
        translateX.value = withTiming(maxTranslate, { duration: 120 });
        runOnJS(commit)();
      } else if (progress < TAP_NUDGE_MAX_PROGRESS && maxTranslate > 0) {
        // Tapped instead of slid: hint the direction, then settle back.
        translateX.value = withSequence(
          withTiming(Math.min(maxTranslate * 0.35, 56), { duration: 170 }),
          withSpring(0, { damping: 18, stiffness: 200 }),
        );
        runOnJS(logTapNudge)(progress);
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
        runOnJS(snapBack)('release_early', progress);
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

  const indicatorColor = vaultColors.ink;

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
    <GestureDetector gesture={pan}>
      <View
        onLayout={handleLayout}
        style={[
          styles.track,
          compact && styles.trackCompact,
          disabled && styles.trackDisabled,
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
          <Animated.View style={[styles.fill, fillAnimatedStyle]} pointerEvents="none" />
        ) : null}

        {showProcessing ? (
          <View style={styles.processingRow} pointerEvents="none">
            <ActivityIndicator color={indicatorColor} size="small" />
            <LiveRoomText style={styles.label} numberOfLines={1}>
              {PROCESSING_LABEL}
            </LiveRoomText>
          </View>
        ) : (
          <Animated.View style={[styles.labelWrap, labelAnimatedStyle]} pointerEvents="none">
            <LiveRoomText
              style={[styles.label, disabled && styles.labelDisabled]}
              numberOfLines={1}
            >
              {label}
            </LiveRoomText>
          </Animated.View>
        )}

        {!showProcessing ? (
          <Animated.View
            style={[styles.thumb, compact && styles.thumbCompact, thumbAnimatedStyle]}
            pointerEvents="none"
          >
            <View style={[styles.thumbInner, compact && styles.thumbInnerCompact, disabled && styles.thumbDisabled]}>
              <Ionicons
                name="chevron-forward"
                size={compact ? 13 : 18}
                color={disabled ? 'rgba(255,255,255,0.35)' : vaultColors.gold}
              />
            </View>
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackCompact: {
    minHeight: 32,
  },
  trackBusy: {
    opacity: 0.92,
  },
  trackDisabled: {
    opacity: 0.45,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: vaultColors.gold,
    opacity: 0.9,
  },
  labelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: vaultFonts.labelExtraBold,
    color: vaultColors.ink,
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  labelDisabled: {
    color: 'rgba(255,255,255,0.4)',
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
  thumbInner: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#100e0b',
    borderWidth: 1.5,
    borderColor: vaultColors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbInnerCompact: {
    borderRadius: THUMB_SIZE_COMPACT / 2,
  },
  thumbDisabled: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
});
