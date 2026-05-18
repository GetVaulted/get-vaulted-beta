import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/** Cinematic motion behind the hero — always on so the lane feels alive pre-broadcast. */
export function HeroAmbientLayer({ roomLive, biddingUrgent }: { roomLive: boolean; biddingUrgent?: boolean }) {
  const drift = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 8000, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 8000, useNativeDriver: true }),
      ]),
    );
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ]),
    );
    driftLoop.start();
    shimmerLoop.start();
    return () => {
      driftLoop.stop();
      shimmerLoop.stop();
    };
  }, [drift, shimmer]);

  const driftX = drift.interpolate({ inputRange: [0, 1], outputRange: [-12, 18] });
  const driftX2 = drift.interpolate({ inputRange: [0, 1], outputRange: [12, -18] });
  const driftY = drift.interpolate({ inputRange: [0, 1], outputRange: [8, -10] });
  const shimmerOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.22] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.orbGold, { transform: [{ translateX: driftX }, { translateY: driftY }] }]} />
      <Animated.View
        style={[
          styles.orbRed,
          roomLive && styles.orbRedLive,
          { transform: [{ translateX: driftX2 }, { translateY: driftY }] },
        ]}
      />
      {biddingUrgent ? (
        <Animated.View style={[styles.urgentWash, { opacity: shimmerOpacity }]} />
      ) : (
        <Animated.View style={[styles.shimmerBar, { opacity: shimmerOpacity }]}>
          <LinearGradient
            colors={['transparent', 'rgba(212,175,55,0.35)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  orbGold: {
    position: 'absolute',
    top: '8%',
    left: '-10%',
    width: '70%',
    height: '55%',
    borderRadius: 200,
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  orbRed: {
    position: 'absolute',
    bottom: '15%',
    right: '-15%',
    width: '60%',
    height: '45%',
    borderRadius: 180,
    backgroundColor: 'rgba(80,40,120,0.12)',
  },
  orbRedLive: { backgroundColor: 'rgba(255,59,48,0.1)' },
  shimmerBar: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    height: 80,
  },
  urgentWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,59,48,0.06)',
  },
});
