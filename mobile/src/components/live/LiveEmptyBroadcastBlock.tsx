import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { LiveStackParamList, MainTabParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';

type TabNav = BottomTabNavigationProp<MainTabParamList>;

type Props = {
  title?: string;
  subtitle?: string;
  /** When true, wires default CTAs: HQ (live) + Discover */
  useDefaultTabActions?: boolean;
  onStartLive?: () => void;
  onExploreListings?: () => void;
};

export function LiveEmptyBroadcastBlock({
  title = 'No live rooms right now',
  subtitle = 'The next break is loading.',
  useDefaultTabActions = true,
  onStartLive,
  onExploreListings,
}: Props) {
  const stackNav = useNavigation<NativeStackNavigationProp<LiveStackParamList>>();
  const pulse = useSharedValue(1);
  const wave = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    wave.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.out(Easing.cubic) }), -1, false);
  }, [pulse, wave]);

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + wave.value * 0.55 }],
    opacity: 0.45 * (1 - wave.value),
  }));

  const goStart = () => {
    if (onStartLive) {
      onStartLive();
      return;
    }
    if (!useDefaultTabActions) return;
    const tab = stackNav.getParent<TabNav>();
    tab?.navigate('HQ');
  };

  const goExplore = () => {
    if (onExploreListings) {
      onExploreListings();
      return;
    }
    if (!useDefaultTabActions) return;
    const tab = stackNav.getParent<TabNav>();
    tab?.navigate('Discover');
  };

  return (
    <View style={styles.wrap}>
      <LinearGradient colors={['#060910', '#0f1622', '#08060a']} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.waveRing, ringStyle]} />
      <Animated.View style={[styles.iconCore, coreStyle]}>
        <LinearGradient colors={['#1a1208', '#2a1a0a', '#120c06']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.liveDot} />
        <Ionicons name="radio" size={28} color="#FFC86A" />
      </Animated.View>
      <Text style={styles.kicker}>LIVE</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{subtitle}</Text>
      <View style={styles.ctaRow}>
        <Pressable style={styles.ctaPrimary} onPress={goStart}>
          <Ionicons name="videocam-outline" size={18} color="#0a0a0a" />
          <Text style={styles.ctaPrimaryTxt}>Start a Live Show</Text>
        </Pressable>
        <Pressable style={styles.ctaSecondary} onPress={goExplore}>
          <Ionicons name="albums-outline" size={18} color={colors.gold} />
          <Text style={styles.ctaSecondaryTxt}>Explore Listings</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 232,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 120, 0.22)',
    padding: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  waveRing: {
    position: 'absolute',
    left: spacing.xl + 4,
    top: spacing.xl + 4,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255, 200, 120, 0.35)',
  },
  iconCore: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 210, 150, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.xs,
    position: 'relative',
  },
  liveDot: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF5A4A',
  },
  kicker: {
    ...typography.micro,
    color: 'rgba(255, 200, 160, 0.75)',
    letterSpacing: 1.4,
    marginTop: spacing.xs,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 20,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 420,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  ctaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  ctaPrimaryTxt: {
    color: '#0a0a0a',
    fontWeight: '800',
    fontSize: 14,
  },
  ctaSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 210, 150, 0.35)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  ctaSecondaryTxt: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 14,
  },
});
