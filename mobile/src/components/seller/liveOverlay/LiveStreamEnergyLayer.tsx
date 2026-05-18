import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/** Subtle motion so the lane feels live — scan sweep + breathing exposure. */
export function LiveStreamEnergyLayer({ active }: { active: boolean }) {
  const sweep = useRef(new Animated.Value(0)).current;
  const exposure = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      sweep.setValue(0);
      exposure.setValue(0);
      return;
    }
    const sweepLoop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 4200, useNativeDriver: true }),
    );
    const expLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(exposure, { toValue: 1, duration: 2800, useNativeDriver: true }),
        Animated.timing(exposure, { toValue: 0, duration: 2800, useNativeDriver: true }),
      ]),
    );
    sweepLoop.start();
    expLoop.start();
    return () => {
      sweepLoop.stop();
      expLoop.stop();
    };
  }, [active, exposure, sweep]);

  const sweepY = sweep.interpolate({ inputRange: [0, 1], outputRange: ['-18%', '118%'] });
  const expOpacity = exposure.interpolate({ inputRange: [0, 1], outputRange: [0.02, 0.08] });

  if (!active) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.sweepBand, { transform: [{ translateY: sweepY }] }]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.06)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[styles.scanlines, { opacity: expOpacity }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  sweepBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '22%',
  },
  scanlines: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.04)',
  },
});
