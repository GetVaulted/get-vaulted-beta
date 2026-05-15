import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radii, spacing } from '../../theme';

type Props = {
  count?: number;
  height?: number;
};

export function ShimmerRail({ count = 4, height = 220 }: Props) {
  const pulse = useSharedValue(0.28);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.92, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [pulse]);

  return (
    <View style={styles.row}>
      {Array.from({ length: count }).map((_, i) => (
        <ShimmerCard key={i} pulse={pulse} index={i} height={height} />
      ))}
    </View>
  );
}

function ShimmerCard({
  pulse,
  index,
  height,
}: {
  pulse: SharedValue<number>;
  index: number;
  height: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: 0.18 + pulse.value * 0.42 - index * 0.03,
  }));

  return (
    <Animated.View style={[styles.card, { height }, style]}>
      <View style={styles.innerBar} />
      <View style={[styles.innerBar, { width: '72%' }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
  card: {
    width: 200,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  innerBar: {
    height: 10,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    width: '100%',
  },
});
