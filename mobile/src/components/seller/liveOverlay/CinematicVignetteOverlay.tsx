import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/** Premium edge treatment — vignette + soft fades, no decorative blobs. */
export function CinematicVignetteOverlay({ urgent }: { urgent?: boolean }) {
  const grain = useRef(new Animated.Value(0.04)).current;

  useEffect(() => {
    const flicker = Animated.loop(
      Animated.sequence([
        Animated.timing(grain, { toValue: 0.07, duration: 120, useNativeDriver: true }),
        Animated.timing(grain, { toValue: 0.03, duration: 180, useNativeDriver: true }),
        Animated.timing(grain, { toValue: 0.05, duration: 90, useNativeDriver: true }),
      ]),
    );
    flicker.start();
    return () => flicker.stop();
  }, [grain]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.55)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.42)', 'transparent', 'rgba(0,0,0,0.5)']}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.72)']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {urgent ? (
        <LinearGradient
          colors={['rgba(255,59,48,0.08)', 'transparent', 'rgba(255,59,48,0.06)']}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Animated.View style={[styles.grain, { opacity: grain }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  grain: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
});
