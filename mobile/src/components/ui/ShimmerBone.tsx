import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  style?: StyleProp<ViewStyle>;
  /** Stagger index for pulse offset (0-based). */
  index?: number;
  borderRadius?: number;
};

export function ShimmerBone({ style, index = 0, borderRadius = 6 }: Props) {
  const pulse = useSharedValue(0.35);
  const sweep = useSharedValue(-1);

  useEffect(() => {
    const delay = index * 90;
    pulse.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
    sweep.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 1600, easing: Easing.linear }), -1, false),
    );
  }, [index, pulse, sweep]);

  const shellStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + pulse.value * 0.4,
  }));

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweep.value * 120 - 60 }],
  }));

  return (
    <Animated.View style={[styles.shell, { borderRadius }, shellStyle, style]}>
      <Animated.View style={[styles.sweepWrap, sweepStyle]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.12)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.sweep}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  sweepWrap: {
    ...StyleSheet.absoluteFillObject,
    width: 80,
  },
  sweep: {
    flex: 1,
    width: 80,
  },
});
