import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildSurpriseCardShuffle,
  SURPRISE_CARD_HOLD_MS,
  SURPRISE_CARD_INTRO_MS,
  SURPRISE_CARD_OUTRO_MS,
  type SurpriseCardFields,
} from '../../../../shared/surprise-reveal-card';
import type { VaultRevealSpinPayload } from '../../lib/vaultRevealSpin';
import { colors } from '../../theme';
import { LiveRoomText } from './LiveRoomText';

type Phase = 'intro' | 'shuffle' | 'won' | 'outro';

/**
 * Surprise Set reveal — TikTok-style card: "Randomizing for @buyer…" while item names shuffle
 * blurred and slow down, then the winning item locks in.
 *
 * Deliberately NOT a <Modal>: on iOS a second modal can't present while the purchase sheet's modal
 * is still dismissing, so a modal reveal could silently never appear for the buyer. This renders as
 * an absolutely positioned layer over the live feed instead.
 */
export function SurpriseRevealCardOverlay({
  spin,
  card,
  onDismiss,
  viewerUsername,
}: {
  spin: VaultRevealSpinPayload;
  card: SurpriseCardFields;
  onDismiss: () => void;
  viewerUsername?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const steps = useMemo(() => buildSurpriseCardShuffle(card, spin.spinId), [card, spin.spinId]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [stepIndex, setStepIndex] = useState(0);
  const enter = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(() => !cancelled && fn(), ms));

    setPhase('intro');
    setStepIndex(0);
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: SURPRISE_CARD_INTRO_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    let t = SURPRISE_CARD_INTRO_MS;
    at(t, () => setPhase('shuffle'));
    steps.forEach((step, i) => {
      at(t, () => {
        setStepIndex(i);
        if (i % 3 === 0) void Haptics.selectionAsync().catch(() => {});
      });
      t += step.holdMs;
    });
    at(t, () => {
      setPhase('won');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      pop.setValue(0.9);
      flash.setValue(1);
      Animated.parallel([
        Animated.spring(pop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]).start();
    });
    t += SURPRISE_CARD_HOLD_MS;
    at(t, () => {
      setPhase('outro');
      Animated.timing(enter, { toValue: 0, duration: SURPRISE_CARD_OUTRO_MS, useNativeDriver: true }).start();
    });
    t += SURPRISE_CARD_OUTRO_MS;
    at(t, () => onDismissRef.current());

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [spin.spinId, steps, enter, pop, flash]);

  const buyer = (spin.buyerUsername ?? '').replace(/^@+/, '').trim();
  const viewer = (viewerUsername ?? '').replace(/^@+/, '').trim();
  const isMe = Boolean(buyer && viewer && buyer.toLowerCase() === viewer.toLowerCase());
  const won = phase === 'won' || phase === 'outro';
  const shown = won ? card.cardWinner : steps[stepIndex]?.name ?? '';
  const progress = steps.length > 1 ? Math.min(1, stepIndex / (steps.length - 1)) : 1;
  const blurIntensity = won ? 0 : phase === 'intro' ? 60 : Math.round(Math.max(12, 55 * (1 - progress ** 1.6)));

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] });

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, { opacity: enter }]} pointerEvents="none" />
      <Pressable
        style={[styles.anchor, { paddingBottom: insets.bottom + 120 }]}
        onPress={() => onDismissRef.current()}
        accessibilityRole="alert"
        accessibilityLabel={won ? `${buyer ? `@${buyer}` : 'Buyer'} got ${card.cardWinner}` : 'Randomizing surprise'}
      >
        <Animated.View style={[styles.cardWrap, { opacity: enter, transform: [{ translateY }, { scale }] }]}>
          <LinearGradient
            colors={won ? ['#fcd34d', '#fef08a', '#f59e0b'] : ['#52525b', '#71717a', '#3f3f46']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.border, won && styles.borderWon]}
          >
            <View style={styles.inner}>
              <Animated.View style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} pointerEvents="none" />
              <View style={styles.row}>
                <View style={[styles.badge, won && styles.badgeWon]}>
                  <LiveRoomText style={[styles.badgeTxt, won && styles.badgeTxtWon]}>{won ? '★' : '?'}</LiveRoomText>
                </View>
                <View style={styles.textCol}>
                  <View style={styles.nameBox}>
                    <Animated.View style={{ transform: [{ scale: pop }] }}>
                      <LiveRoomText
                        style={[styles.name, !won && Platform.OS === 'android' && styles.nameShuffleAndroid]}
                        numberOfLines={1}
                      >
                        {shown}
                      </LiveRoomText>
                    </Animated.View>
                    {!won && Platform.OS === 'ios' ? (
                      <BlurView intensity={blurIntensity} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
                    ) : null}
                  </View>
                  <LiveRoomText style={styles.sub} numberOfLines={1}>
                    {won
                      ? isMe
                        ? "You got it! Here's your instant surprise 🎉"
                        : `@${buyer || 'buyer'} — here's your instant surprise!`
                      : `Randomizing for ${isMe ? 'you' : buyer ? `@${buyer}` : 'buyer'}…`}
                  </LiveRoomText>
                </View>
              </View>
              <View style={styles.footer}>
                <LiveRoomText style={styles.footerTitle} numberOfLines={1}>
                  {spin.title}
                </LiveRoomText>
                <LiveRoomText style={styles.footerNote} numberOfLines={1}>Server draw</LiveRoomText>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 1000, elevation: 1000 },
  dim: { backgroundColor: 'rgba(0,0,0,0.5)' },
  anchor: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16 },
  cardWrap: { width: '100%', maxWidth: 380 },
  border: { borderRadius: 16, padding: 2 },
  borderWon: {
    shadowColor: '#fbbf24',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  inner: { borderRadius: 14, backgroundColor: '#0a0a0c', paddingHorizontal: 16, paddingVertical: 14, overflow: 'hidden' },
  flash: { backgroundColor: 'rgba(253, 230, 138, 0.25)' },
  row: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginRight: 12,
  },
  badgeWon: { backgroundColor: '#fcd34d' },
  badgeTxt: { fontSize: 18, fontWeight: '900', color: colors.gold },
  badgeTxtWon: { color: '#000' },
  textCol: { flex: 1, minWidth: 0 },
  nameBox: { position: 'relative', overflow: 'hidden', borderRadius: 6 },
  name: { fontSize: 18, fontWeight: '800', color: '#fff' },
  nameShuffleAndroid: { opacity: 0.55 },
  sub: { marginTop: 2, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  footer: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerTitle: {
    flexShrink: 1,
    marginRight: 8,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(252, 211, 77, 0.9)',
  },
  footerNote: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textMuted },
});
