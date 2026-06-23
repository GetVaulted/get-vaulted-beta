import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  isVaultSealRevealKind,
  VAULT_SEAL_BREAK_MS,
  VAULT_SEAL_GLOW_MS,
  VAULT_SEAL_TOTAL_MS,
  vaultSealMetaLine,
  vaultSealWinnerCopy,
  type VaultRevealSpinPayload,
} from '../../lib/vaultRevealSpin';
import { colors, radii, spacing } from '../../theme';

type SealPhase = 'idle' | 'glow' | 'break' | 'winner';

export function VaultSealRevealOverlay({
  spin,
  onDismiss,
}: {
  spin: VaultRevealSpinPayload | null;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<SealPhase>('idle');
  const seenRef = useRef<string | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const sealGlow = useRef(new Animated.Value(0)).current;
  const sealLeft = useRef(new Animated.Value(0)).current;
  const sealRight = useRef(new Animated.Value(0)).current;
  const winnerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!spin || !isVaultSealRevealKind(spin.kind)) {
      setPhase('idle');
      seenRef.current = null;
      sealGlow.setValue(0);
      sealLeft.setValue(0);
      sealRight.setValue(0);
      winnerOpacity.setValue(0);
      return;
    }
    if (seenRef.current === spin.spinId) return;
    seenRef.current = spin.spinId;

    setPhase('glow');
    sealGlow.setValue(0);
    sealLeft.setValue(0);
    sealRight.setValue(0);
    winnerOpacity.setValue(0);

    Animated.timing(sealGlow, {
      toValue: 1,
      duration: VAULT_SEAL_GLOW_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    const tBreak = setTimeout(() => {
      setPhase('break');
      Animated.parallel([
        Animated.timing(sealLeft, {
          toValue: 1,
          duration: VAULT_SEAL_BREAK_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sealRight, {
          toValue: 1,
          duration: VAULT_SEAL_BREAK_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }, VAULT_SEAL_GLOW_MS);

    const tWinner = setTimeout(() => {
      setPhase('winner');
      Animated.timing(winnerOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, VAULT_SEAL_GLOW_MS + VAULT_SEAL_BREAK_MS);

    const tDismiss = setTimeout(() => onDismissRef.current(), VAULT_SEAL_TOTAL_MS);

    return () => {
      clearTimeout(tBreak);
      clearTimeout(tWinner);
      clearTimeout(tDismiss);
    };
  }, [sealGlow, sealLeft, sealRight, spin, winnerOpacity]);

  if (!spin || !isVaultSealRevealKind(spin.kind)) return null;

  const winner = vaultSealWinnerCopy(spin);
  const showWinner = phase === 'winner';
  const sealBreaking = phase === 'break' || showWinner;

  const leftSplit = sealLeft.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -18],
  });
  const rightSplit = sealRight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 18],
  });
  const glowScale = sealGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onDismiss}>
      <Pressable style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]} onPress={onDismiss}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Vaulted Live</Text>
          <Text style={styles.title} numberOfLines={2}>
            {spin.title}
          </Text>
          <Text style={styles.meta}>{vaultSealMetaLine(spin)}</Text>

          <View style={styles.stage}>
            {!showWinner ? (
              <View style={styles.sealHost}>
                <Animated.View style={[styles.sealGlow, { opacity: sealGlow, transform: [{ scale: glowScale }] }]} />
                <Animated.View
                  style={[
                    styles.sealHalf,
                    styles.sealLeft,
                    sealBreaking && { opacity: sealLeft.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
                    { transform: [{ translateX: leftSplit }, { rotate: '-12deg' }] },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.sealHalf,
                    styles.sealRight,
                    sealBreaking && { opacity: sealRight.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
                    { transform: [{ translateX: rightSplit }, { rotate: '12deg' }] },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.sealCore,
                    { opacity: sealBreaking ? sealLeft.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 0.4, 0] }) : 1 },
                  ]}
                >
                  <Text style={styles.sealV}>V</Text>
                </Animated.View>
                <Text style={styles.phaseTxt}>
                  {phase === 'glow' ? 'Opening vault…' : phase === 'break' ? 'Seal broken' : ''}
                </Text>
              </View>
            ) : null}

            {showWinner ? (
              <Animated.View style={[styles.winnerBlock, { opacity: winnerOpacity }]}>
                <Text style={styles.winnerKicker}>{winner.kicker}</Text>
                <Text style={styles.winnerName}>{winner.primary}</Text>
                {winner.sub ? <Text style={styles.winnerSub}>{winner.sub}</Text> : null}
                {winner.detail ? <Text style={styles.prizeName}>{winner.detail}</Text> : null}
              </Animated.View>
            ) : null}
          </View>

          <Pressable style={styles.dismissBtn} onPress={onDismiss}>
            <Text style={styles.dismissTxt}>{showWinner ? 'Continue' : 'Skip'}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: '#0c0c0e',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    overflow: 'hidden',
  },
  kicker: {
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '900',
    color: colors.gold,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  meta: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  stage: {
    marginTop: spacing.lg,
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealHost: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealGlow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  sealHalf: {
    position: 'absolute',
    width: 48,
    height: 72,
    backgroundColor: 'rgba(212,175,55,0.22)',
    borderColor: 'rgba(212,175,55,0.45)',
    borderWidth: 1,
  },
  sealLeft: {
    left: 12,
    borderTopLeftRadius: 36,
    borderBottomLeftRadius: 36,
    borderRightWidth: 0,
  },
  sealRight: {
    right: 12,
    borderTopRightRadius: 36,
    borderBottomRightRadius: 36,
    borderLeftWidth: 0,
  },
  sealCore: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'rgba(212,175,55,0.65)',
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealV: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.gold,
  },
  phaseTxt: {
    position: 'absolute',
    bottom: -8,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,215,120,0.85)',
  },
  winnerBlock: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  winnerKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,215,120,0.9)',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  winnerName: {
    marginTop: spacing.sm,
    fontSize: 28,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  winnerSub: {
    marginTop: spacing.sm,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  prizeName: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '800',
    color: 'rgba(255,235,180,0.92)',
    textAlign: 'center',
  },
  dismissBtn: {
    marginTop: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  dismissTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
