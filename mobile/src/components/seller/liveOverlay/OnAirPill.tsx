import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme';

export function OnAirPill({ label, liveFeed }: { label: string; liveFeed?: boolean }) {
  const breathe = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.35)).current;
  const dot = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.95, duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.25, duration: 900, useNativeDriver: true }),
      ]),
    );
    const dotLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(dot, { toValue: 0.3, duration: 520, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 1, duration: 520, useNativeDriver: true }),
      ]),
    );
    breatheLoop.start();
    glowLoop.start();
    dotLoop.start();
    return () => {
      breatheLoop.stop();
      glowLoop.stop();
      dotLoop.stop();
    };
  }, [breathe, dot, glow]);

  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }]} pointerEvents="none">
      <Animated.View style={[styles.glowHalo, { opacity: glow }]} />
      <LinearGradient
        colors={['rgba(255,59,48,0.35)', 'rgba(80,8,8,0.75)', 'rgba(20,0,0,0.85)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>
        <Animated.View style={[styles.dot, { opacity: dot }]} />
        <Text style={styles.txt}>{label}</Text>
        {liveFeed ? <View style={styles.feedTag}><Text style={styles.feedTagTxt}>FEED</Text></View> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,48,0.65)',
    shadowColor: colors.live,
    shadowOpacity: 0.85,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  glowHalo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,59,48,0.45)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.live,
  },
  txt: {
    color: 'rgba(255,255,255,0.96)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  feedTag: {
    marginLeft: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  feedTagTxt: {
    fontSize: 8,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.8,
  },
});
