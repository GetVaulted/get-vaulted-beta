import { useEffect, useRef } from 'react';
import { AppState, Animated, Easing, Modal, StyleSheet, View, type AppStateStatus } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  formatSpotCelebrationAccessibility,
  formatSpotCelebrationPrice,
  isSpotCelebrationViewerWinner,
  spotCelebrationDismissKey,
  spotCelebrationHeadline,
  spotCelebrationKicker,
  spotCelebrationTagline,
  SPOT_CELEBRATION_DISPLAY_MS,
  type LiveSpotTakenCelebration,
} from '../../lib/liveSpotCelebration';
import { colors, radii, spacing } from '../../theme';
import { LIVE_CLAIM_CTA_GRADIENT } from './liveClaimCtaStyle';
import { LiveRoomText } from './LiveRoomText';

type Props = {
  celebration: LiveSpotTakenCelebration | null;
  onDone: () => void;
  viewerUsername?: string | null;
};

const DISPLAY_MS = SPOT_CELEBRATION_DISPLAY_MS;

/** PYT/PYD spot win — full-screen hype card; mount last in the tree so it stacks above checkout modals. */
export function LiveSpotTakenCelebration({ celebration, onDone, viewerUsername }: Props) {
  const onDoneRef = useRef(onDone);
  const shownAtRef = useRef<number | null>(null);
  const cardScale = useRef(new Animated.Value(0.9)).current;
  const headlineScale = useRef(new Animated.Value(1)).current;

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
      return undefined;
    }

    if (viewerIsWinner) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    shownAtRef.current = Date.now();
    cardScale.setValue(0.9);
    headlineScale.setValue(1);

    Animated.spring(cardScale, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();

    Animated.sequence([
      Animated.delay(180),
      Animated.timing(headlineScale, {
        toValue: 1.08,
        duration: 160,
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

    const id = setTimeout(() => onDoneRef.current(), DISPLAY_MS);

    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active' || shownAtRef.current == null) return;
      if (Date.now() - shownAtRef.current >= DISPLAY_MS) {
        onDoneRef.current();
      }
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      clearTimeout(id);
      sub.remove();
    };
  }, [cardScale, dismissKey, headlineScale]);

  if (!celebration) return null;

  const headline = spotCelebrationHeadline(celebration.kind, { viewerIsWinner });
  const price = formatSpotCelebrationPrice(celebration.amountUsd);
  const accessibilityLabel = formatSpotCelebrationAccessibility(celebration, { viewerIsWinner });

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
        <View style={styles.glow} />
        <Animated.View style={[styles.cardWrap, { transform: [{ scale: cardScale }] }]}>
          <LinearGradient colors={[...LIVE_CLAIM_CTA_GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientBorder}>
            <View style={styles.cardInner}>
              <LiveRoomText style={styles.kicker}>{spotCelebrationKicker(celebration.kind)}</LiveRoomText>
              <Animated.View style={{ transform: [{ scale: headlineScale }] }}>
                <LiveRoomText style={styles.headline}>{headline}</LiveRoomText>
              </Animated.View>
              <LiveRoomText style={styles.label} numberOfLines={2}>
                {celebration.label}
              </LiveRoomText>
              {!viewerIsWinner ? (
                <LiveRoomText style={styles.username}>@{celebration.username}</LiveRoomText>
              ) : null}
              {price ? <LiveRoomText style={styles.price}>{price}</LiveRoomText> : null}
              <LiveRoomText style={styles.tagline}>{spotCelebrationTagline(celebration.kind)}</LiveRoomText>
            </View>
          </LinearGradient>
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
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(139, 92, 246, 0.22)',
    shadowColor: '#D946EF',
    shadowOpacity: 0.45,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 0 },
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg + 4,
    alignItems: 'center',
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
    textShadowColor: 'rgba(217, 70, 239, 0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
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
  price: {
    marginTop: spacing.sm,
    color: colors.success,
    fontSize: 28,
    fontWeight: '900',
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
