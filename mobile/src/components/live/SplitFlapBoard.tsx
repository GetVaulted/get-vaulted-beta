import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { vaultDropReelPillLabel, type VaultRevealSpinPayload } from '../../lib/vaultRevealSpin';
import { LiveRoomText } from './LiveRoomText';

/**
 * "Split-Flap Board" — the Givvy Draw reveal mechanic (mobile). Replaces the horizontal
 * slot-reel visual with a single mechanical flap tile, airport-departure-board style: it
 * flips through entries and locks on the winner, with LED dots confirming the lock. Used
 * for both open and buyers givvy draws — copy differences are handled entirely upstream by
 * `vaultDropRevealEyebrow` / `vaultDropRevealGivvyWinBanner`, this component only renders
 * whichever label index it's given.
 *
 * Driven by the parent's existing reel-progress plumbing: `flapIndex` is updated by
 * VaultDropRevealOverlay's reelX progress listener on the same cadence that already fires
 * `Haptics.selectionAsync()` per pill passed, so flips and haptic ticks land on the same
 * frame without any new timing logic. `bump`/`glow` are the same Animated.Values the old
 * reel used for its winner-lock pop and glow — reused here for the tile's lock bump and the
 * LED glow-in, so the lock moment feels identical across both visual treatments.
 */
export function SplitFlapBoard({
  spin,
  showWinner,
  flapIndex,
  bump,
  glow,
}: {
  spin: VaultRevealSpinPayload;
  showWinner: boolean;
  flapIndex: number;
  bump: Animated.Value;
  glow: Animated.Value;
}) {
  const rotateX = useRef(new Animated.Value(0)).current;
  const targetIndex = showWinner ? spin.winnerIndex : flapIndex;
  const [displayIndex, setDisplayIndex] = useState(targetIndex);
  const flipKey = `${showWinner ? 'win' : 'pool'}-${targetIndex}`;
  const prevKeyRef = useRef(flipKey);

  useEffect(() => {
    if (prevKeyRef.current === flipKey) return;
    prevKeyRef.current = flipKey;
    Animated.timing(rotateX, {
      toValue: 1,
      duration: 90,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setDisplayIndex(targetIndex);
      rotateX.setValue(-1);
      Animated.timing(rotateX, {
        toValue: 0,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipKey]);

  const rotate = rotateX.interpolate({ inputRange: [-1, 0, 1], outputRange: ['82deg', '0deg', '-82deg'] });
  const label = vaultDropReelPillLabel(spin, displayIndex);
  const ledOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <View style={styles.board}>
      <View style={[styles.rivet, styles.rivetTl]} />
      <View style={[styles.rivet, styles.rivetTr]} />
      <View style={[styles.rivet, styles.rivetBl]} />
      <View style={[styles.rivet, styles.rivetBr]} />

      <Animated.View
        style={[
          styles.tile,
          { transform: [{ perspective: 400 }, { rotateX }, { scale: bump }] },
        ]}
      >
        <LiveRoomText
          style={[styles.tileTxt, showWinner && styles.tileTxtWinner]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {label}
        </LiveRoomText>
        <View style={styles.crease} pointerEvents="none" />
      </Animated.View>

      <View style={styles.leds}>
        {[0, 1, 2].map((i) => (
          <Animated.View
            key={i}
            style={[
              styles.led,
              {
                backgroundColor: showWinner ? '#6ee7b7' : 'rgba(255,255,255,0.16)',
                opacity: showWinner ? ledOpacity : 1,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    marginTop: 4,
    width: '100%',
    height: 62,
    borderRadius: 12,
    backgroundColor: '#12160f',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  rivet: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  rivetTl: { top: 5, left: 7 },
  rivetTr: { top: 5, right: 7 },
  rivetBl: { bottom: 5, left: 7 },
  rivetBr: { bottom: 5, right: 7 },
  tile: {
    width: '80%',
    maxWidth: 260,
    height: 42,
    borderRadius: 6,
    backgroundColor: '#0e120d',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 10,
  },
  tileTxt: {
    fontSize: 14,
    fontWeight: '800',
    color: '#eafff5',
    letterSpacing: 0.2,
  },
  tileTxtWinner: {
    color: '#FFE9A8',
  },
  crease: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  leds: {
    position: 'absolute',
    right: 10,
    bottom: 7,
    flexDirection: 'row',
    gap: 4,
  },
  led: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
