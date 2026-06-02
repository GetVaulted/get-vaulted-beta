import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { colors, radii, spacing } from '../../../theme';

type RailAction = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  accent?: boolean;
};

function RailButton({
  icon,
  label,
  accent,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  accent?: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  const pressIn = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.88, friction: 6, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };
  const pressOut = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      accessibilityLabel={label}
      style={styles.btnOuter}
    >
      <Animated.View style={[styles.btn, { transform: [{ scale }] }]}>
        <Animated.View
          style={[
            styles.btnGlow,
            accent && styles.btnGlowAccent,
            { opacity: glow },
          ]}
        />
        <Ionicons
          name={icon}
          size={20}
          color={accent ? colors.gold : 'rgba(255,255,255,0.94)'}
        />
        <Text style={[styles.label, accent && styles.labelAccent]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function SellerLiveOverlayRail({
  bottom,
  onLineup,
  onObs,
}: {
  bottom: number;
  onLineup: () => void;
  onObs: () => void;
}) {
  const actions: RailAction[] = [
    { key: 'lineup', icon: 'layers-outline', label: SELLER_CONSOLE.lineup, onPress: onLineup },
    { key: 'obs', icon: 'radio-outline', label: SELLER_CONSOLE.obsSetup, onPress: onObs, accent: true },
  ];

  return (
    <View style={[styles.railHost, { bottom, right: spacing.xs }]}>
      <View style={styles.glassRail}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.androidRail} />
        )}
        <View style={styles.rail}>
          {actions.map((a) => (
            <RailButton
              key={a.key}
              icon={a.icon}
              label={a.label}
              accent={a.accent}
              onPress={a.onPress}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  railHost: {
    position: 'absolute',
    zIndex: 5,
  },
  glassRail: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  androidRail: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,8,0.55)',
  },
  rail: {
    alignItems: 'center',
    gap: 10,
  },
  btnOuter: { alignItems: 'center' },
  btn: {
    alignItems: 'center',
    gap: 2,
    minWidth: 44,
    paddingVertical: 2,
  },
  btnGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  btnGlowAccent: {
    backgroundColor: 'rgba(212,175,55,0.25)',
  },
  label: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.2,
    textAlign: 'center',
    maxWidth: 52,
  },
  labelAccent: { color: colors.gold },
});
