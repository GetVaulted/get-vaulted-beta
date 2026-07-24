import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { logBidControl } from '../../lib/bidControlLog';
import { colors, radii } from '../../theme';
import { LIVE_CLAIM_CTA_GRADIENT } from './liveClaimCtaStyle';
import { LiveRoomText } from './LiveRoomText';

/** Deliberate hold duration — short enough for fast auctions, long enough to avoid swipe accidents. */
export const HOLD_TO_BID_MS = 280;

/** Bid ACK in flight — not payment. Settlement charges when the auction timer ends. */
const PROCESSING_LABEL = 'Placing bid…';

type Props = {
  label: string;
  disabled?: boolean;
  /** Network in flight — shows Placing bid… and blocks new holds until cleared. */
  busy?: boolean;
  onCommit: () => void;
  /** Return false to abort the hold (e.g. auth required). */
  onHoldStart?: () => boolean | void;
  /** Purple live-feed bid styling vs default gold. */
  variant?: 'gold' | 'auction';
  compact?: boolean;
};

export function HoldToBidButton({
  label,
  disabled = false,
  busy = false,
  onCommit,
  onHoldStart,
  variant = 'gold',
  compact = false,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const holdingRef = useRef(false);
  const committedRef = useRef(false);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const stopAnim = useCallback(() => {
    animRef.current?.stop();
    animRef.current = null;
  }, []);

  const snapProgressToZero = useCallback(
    (reason: string) => {
      clearHoldTimer();
      stopAnim();
      holdingRef.current = false;
      if (!committedRef.current) {
        logBidControl('reset', { reason });
      }
      committedRef.current = false;
      animRef.current = Animated.timing(progress, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      });
      animRef.current.start(() => {
        animRef.current = null;
      });
    },
    [clearHoldTimer, progress, stopAnim],
  );

  useEffect(() => {
    if (disabled) {
      snapProgressToZero('disabled');
    }
  }, [disabled, snapProgressToZero]);

  useEffect(() => {
    if (busy) {
      snapProgressToZero('busy');
    }
  }, [busy, snapProgressToZero]);

  useEffect(
    () => () => {
      clearHoldTimer();
      stopAnim();
    },
    [clearHoldTimer, stopAnim],
  );

  const handlePressIn = useCallback(() => {
    if (disabled || busy || holdingRef.current || committedRef.current) return;

    const allowed = onHoldStart?.();
    if (allowed === false) {
      logBidControl('blocked', { reason: 'hold start rejected' });
      return;
    }

    holdingRef.current = true;
    committedRef.current = false;
    logBidControl('hold', { label });

    stopAnim();
    progress.setValue(0);
    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_TO_BID_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) animRef.current = null;
    });

    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (!holdingRef.current || committedRef.current) return;
      committedRef.current = true;
      holdingRef.current = false;
      stopAnim();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      onCommit();
      animRef.current = Animated.timing(progress, {
        toValue: 0,
        duration: 100,
        useNativeDriver: false,
      });
      animRef.current.start(() => {
        animRef.current = null;
        committedRef.current = false;
      });
    }, HOLD_TO_BID_MS);
  }, [busy, disabled, label, onCommit, onHoldStart, progress, stopAnim]);

  const handlePressOut = useCallback(() => {
    if (!holdingRef.current || committedRef.current) return;
    snapProgressToZero('release_early');
  }, [snapProgressToZero]);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const auction = variant === 'auction';
  const showProcessing = busy && !disabled;
  const indicatorColor = auction ? '#fff' : '#0a0a0a';

  return (
    <Pressable
      style={[
        styles.shell,
        auction && styles.shellAuction,
        compact && styles.shellCompact,
        disabled && styles.shellDisabled,
        disabled && auction && styles.shellAuctionDisabled,
        showProcessing && styles.shellBusy,
      ]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={showProcessing ? PROCESSING_LABEL : label}
      accessibilityHint="Press and hold to place your bid"
    >
      {auction && !disabled ? (
        <LinearGradient
          colors={[...LIVE_CLAIM_CTA_GRADIENT]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      ) : null}
      {showProcessing ? (
        <View style={styles.processingRow} pointerEvents="none">
          <ActivityIndicator color={indicatorColor} size="small" />
          <LiveRoomText
            style={[styles.label, auction && styles.labelAuction]}
            numberOfLines={1}
          >
            {PROCESSING_LABEL}
          </LiveRoomText>
        </View>
      ) : (
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
      )}
      {!disabled && !busy ? (
        <View style={styles.progressTrack} pointerEvents="none">
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  shellAuction: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#D946EF',
    shadowOpacity: 0.35,
  },
  shellCompact: {
    minHeight: 40,
    paddingVertical: 8,
  },
  shellBusy: {
    opacity: 0.92,
  },
  shellDisabled: {
    opacity: 0.45,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
    shadowOpacity: 0,
    elevation: 0,
  },
  shellAuctionDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  label: {
    color: '#0a0a0a',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.15,
    zIndex: 1,
  },
  labelDisabled: {
    color: 'rgba(255,255,255,0.55)',
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
    zIndex: 1,
  },
  progressTrack: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
    justifyContent: 'flex-end',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
});
