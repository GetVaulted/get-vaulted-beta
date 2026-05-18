import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { MARKETPLACE_LANES, type MarketplaceLaneChip, type MarketplaceLaneId } from '../../data/marketplaceCategories';
import { colors, radii, spacing } from '../../theme';

export type { MarketplaceLaneId, MarketplaceLaneChip };
export type MarketplaceCategoryFilter = MarketplaceLaneId;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PILL_MIN_W = 88;
const PILL_H = 56;
const GAP = spacing.md;
const EDGE_FADE_W = 28;

function LanePill({
  chip,
  selected,
  onPress,
}: {
  chip: MarketplaceLaneChip;
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(selected ? 1 : 0.98);

  useEffect(() => {
    scale.value = withSpring(selected ? 1 : 0.98, { damping: 16, stiffness: 220 });
  }, [selected, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = () => {
    scale.value = 0.96;
  };
  const onPressOut = () => {
    scale.value = selected ? 1 : 0.98;
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.pillOuter, animStyle, selected && styles.pillOuterOn]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={chip.label}
    >
      {selected ? (
        <LinearGradient
          colors={['rgba(212,175,55,0.28)', 'rgba(212,175,55,0.08)', 'rgba(0,0,0,0.4)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {selected ? <View style={styles.innerGlow} pointerEvents="none" /> : null}
      <View style={styles.pillContent}>
        <View style={[styles.iconWrap, selected && styles.iconWrapOn]}>
          <Ionicons name={chip.icon} size={20} color={selected ? colors.gold : colors.textMuted} />
        </View>
        <Text style={[styles.label, selected && styles.labelOn]} numberOfLines={1}>
          {chip.label}
        </Text>
        {chip.badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{chip.badge === 'trending' ? 'Hot' : 'New'}</Text>
          </View>
        ) : null}
        {chip.count != null && chip.count > 0 ? (
          <Text style={styles.countTxt}>{chip.count > 999 ? '999+' : chip.count}</Text>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

function EdgeFade({ side }: { side: 'left' | 'right' }) {
  return (
    <LinearGradient
      colors={
        side === 'left'
          ? [colors.background, 'rgba(5,5,5,0.85)', 'transparent']
          : ['transparent', 'rgba(5,5,5,0.85)', colors.background]
      }
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[styles.edgeFade, side === 'left' ? styles.edgeLeft : styles.edgeRight]}
      pointerEvents="none"
    />
  );
}

export function MarketplaceCategoryRail({
  active,
  onChange,
  lanes = MARKETPLACE_LANES,
}: {
  active: MarketplaceLaneId;
  onChange: (lane: MarketplaceLaneId) => void;
  lanes?: MarketplaceLaneChip[];
}) {
  const scrollRef = useRef<ScrollView>(null);
  const showLeftFade = useSharedValue(0);
  const showRightFade = useSharedValue(1);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const maxX = Math.max(0, contentSize.width - layoutMeasurement.width);
    showLeftFade.value = contentOffset.x > 8 ? 1 : 0;
    showRightFade.value = contentOffset.x < maxX - 8 ? 1 : 0;
  }, [showLeftFade, showRightFade]);

  const onLayoutScroll = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      const contentW = lanes.length * (PILL_MIN_W + GAP) + spacing.lg * 2;
      showRightFade.value = contentW > w ? 1 : 0;
    },
    [lanes.length, showRightFade],
  );

  const leftFadeStyle = useAnimatedStyle(() => ({
    opacity: showLeftFade.value,
  }));
  const rightFadeStyle = useAnimatedStyle(() => ({
    opacity: showRightFade.value,
  }));

  return (
    <View style={styles.shell}>
      <Text style={styles.eyebrow}>Browse by category</Text>
      <View style={styles.railWrap} onLayout={onLayoutScroll}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scrollContent}
          style={styles.scroll}
        >
          {lanes.map((chip) => (
            <LanePill
              key={chip.id}
              chip={chip}
              selected={chip.id === active}
              onPress={() => onChange(chip.id)}
            />
          ))}
        </ScrollView>
        <Animated.View style={[styles.fadeHost, leftFadeStyle]} pointerEvents="none">
          <EdgeFade side="left" />
        </Animated.View>
        <Animated.View style={[styles.fadeHost, rightFadeStyle]} pointerEvents="none">
          <EdgeFade side="right" />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    marginHorizontal: -spacing.lg,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  railWrap: {
    position: 'relative',
    minHeight: PILL_H + spacing.sm,
  },
  scroll: {
    overflow: 'visible',
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    paddingRight: spacing.lg + EDGE_FADE_W,
  },
  fadeHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  edgeFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: EDGE_FADE_W + spacing.md,
  },
  edgeLeft: { left: 0 },
  edgeRight: { right: 0 },
  pillOuter: {
    flexShrink: 0,
    minWidth: PILL_MIN_W,
    minHeight: PILL_H,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  pillOuterOn: {
    borderColor: 'rgba(212,175,55,0.65)',
    backgroundColor: 'rgba(212,175,55,0.1)',
    shadowColor: colors.gold,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  innerGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  pillContent: {
    flex: 1,
    minHeight: PILL_H,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  iconWrapOn: {
    backgroundColor: 'rgba(212,175,55,0.2)',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
  },
  labelOn: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,59,48,0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,48,0.4)',
  },
  badgeTxt: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FF8A80',
    letterSpacing: 0.4,
  },
  countTxt: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.gold,
    marginTop: -2,
  },
});
