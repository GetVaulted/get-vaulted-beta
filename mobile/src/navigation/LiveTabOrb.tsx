import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { marketplaceFontSize, MARKETPLACE_TEXT_PROPS } from '../lib/marketplaceUiScale';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { typography } from '../theme';

/** Deep control-room glass + amber broadcast edge — reads “on air” without flat app red. */
const GRADIENT_ON = ['#03060c', '#0a1420', '#122438', '#8a5a12', '#e8b84a', '#fff2c4'] as const;
const GRADIENT_OFF = ['#040608', '#0a1016', '#121a22', '#1a222c', '#222a32'] as const;

type Props = {
  isFocused: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

export function LiveTabOrb({ isFocused, onPress, accessibilityLabel }: Props) {
  const { width } = useWindowDimensions();
  const scale = Math.min(1, Math.max(0.88, width / 430));
  const orbSize = Math.round(54 * scale);
  const ringSize = Math.round(48 * scale);
  const stackSize = Math.round(92 * scale);
  const wave1 = useSharedValue(0);
  const wave2 = useSharedValue(0);
  const breathe = useSharedValue(1);
  const halo = useSharedValue(0.4);

  useEffect(() => {
    const waveCfg = { duration: 2800, easing: Easing.out(Easing.cubic) };
    wave1.value = withRepeat(withTiming(1, waveCfg), -1, false);
    const t = setTimeout(() => {
      wave2.value = withRepeat(withTiming(1, waveCfg), -1, false);
    }, 1400);
    breathe.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2100, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2100, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
    halo.value = withRepeat(
      withSequence(
        withTiming(0.78, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.36, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
    return () => clearTimeout(t);
  }, []);

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + wave1.value * 0.58 }],
    opacity: 0.48 * (1 - wave1.value),
  }));

  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + wave2.value * 0.58 }],
    opacity: 0.38 * (1 - wave2.value),
  }));

  const orbScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.value }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: halo.value,
  }));

  return (
    <View style={styles.slot}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={accessibilityLabel ?? 'Live'}
        onPress={onPress}
        style={({ pressed }) => [styles.press, pressed && styles.pressed]}
      >
        <View style={[styles.orbStack, { width: stackSize, height: stackSize }]}>
          <Animated.View style={[styles.halo, { width: orbSize + 32, height: orbSize + 32, borderRadius: (orbSize + 32) / 2 }, haloStyle]} />
          <Animated.View style={[styles.ring, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }, ring1Style]} />
          <Animated.View style={[styles.ring, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }, ring2Style]} />

          <Animated.View style={[styles.orbScale, orbScaleStyle, isFocused ? styles.orbGlowOn : styles.orbGlowOff]}>
            <LinearGradient
              colors={isFocused ? [...GRADIENT_ON] : [...GRADIENT_OFF]}
              start={{ x: 0.12, y: 0 }}
              end={{ x: 0.92, y: 1 }}
              style={[styles.orbOuter, { width: orbSize, height: orbSize, borderRadius: orbSize / 2 }]}
            >
              <LinearGradient
                colors={['#070606', '#121010', '#080707']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={[styles.orbInner, { width: orbSize - 6, height: orbSize - 6, borderRadius: (orbSize - 6) / 2 }]}
              >
                <Ionicons name="radio" size={Math.round(24 * scale)} color={isFocused ? '#FFF9EC' : 'rgba(255, 236, 200, 0.72)'} />
              </LinearGradient>
            </LinearGradient>
          </Animated.View>
        </View>

        <Text
          style={[styles.liveLbl, { fontSize: marketplaceFontSize(10, scale) }, isFocused && styles.liveLblOn]}
          numberOfLines={1}
          {...MARKETPLACE_TEXT_PROPS}
        >
          Live
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
    zIndex: 20,
    paddingBottom: 4,
  },
  press: {
    alignItems: 'center',
    marginTop: -22,
    zIndex: 2,
  },
  orbStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255, 210, 140, 0.42)',
    backgroundColor: 'transparent',
  },
  halo: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 190, 110, 0.16)',
    shadowColor: '#ffc86a',
    shadowOpacity: 0.75,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  orbScale: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbGlowOn: {
    shadowColor: '#ffc14a',
    shadowOpacity: 0.55,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  orbGlowOff: {
    shadowColor: '#7a5a20',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  pressed: { opacity: 0.9 },
  orbOuter: {
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbInner: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 210, 150, 0.35)',
  },
  liveLbl: {
    marginTop: 4,
    ...typography.micro,
    letterSpacing: 0.6,
    color: 'rgba(255, 214, 160, 0.78)',
    fontWeight: '800',
  },
  liveLblOn: {
    color: '#FFE6B0',
    textShadowColor: 'rgba(255, 200, 120, 0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
});
