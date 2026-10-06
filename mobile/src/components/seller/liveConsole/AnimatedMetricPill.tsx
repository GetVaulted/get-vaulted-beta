import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, radii, vaultColors } from '../../../theme';

export function AnimatedMetricPill({
  icon,
  label,
  value,
  glow,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  glow?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.06, duration: 120, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
      ]).start();
    }
  }, [scale, value]);

  return (
    <Animated.View style={[styles.wrap, glow && styles.wrapGlow, { transform: [{ scale }] }]}>
      <LinearGradient
        colors={glow ? ['rgba(203,163,92,0.22)', 'rgba(8,8,10,0.9)'] : ['rgba(255,255,255,0.06)', 'rgba(8,8,10,0.88)']}
        style={StyleSheet.absoluteFill}
      />
      <Ionicons name={icon} size={13} color={glow ? vaultColors.gold : colors.textMuted} />
      <View>
        <Text style={[styles.val, glow && styles.valGlow]}>{value}</Text>
        <Text style={styles.lbl}>{label}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    minWidth: 72,
  },
  wrapGlow: {
    borderColor: 'rgba(203,163,92,0.45)',
    shadowColor: '#CBA35C',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  val: { fontSize: 14, fontWeight: '900', color: colors.textPrimary },
  valGlow: { color: vaultColors.gold },
  lbl: { fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
});
