import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { VaultImage } from '../ui/VaultImage';
import type { MarketplaceHeroSlide } from '../../types/marketplaceUi';
import { colors, radii, spacing } from '../../theme';

const HERO_H = 132;
const GAP = spacing.sm;

export function MarketplaceHeroCarousel({
  slides,
  onSlidePress,
}: {
  slides: MarketplaceHeroSlide[];
  onSlidePress?: (slide: MarketplaceHeroSlide) => void;
}) {
  if (!slides.length) return null;

  const screenW = Dimensions.get('window').width;
  const cardW = screenW - spacing.lg * 2;
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollView>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    setIndex(Math.round(x / (cardW + GAP)));
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled={false}
        snapToInterval={cardW + GAP}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.rail}
      >
        {slides.map((slide, slideIndex) => (
          <Pressable
            key={slide.id}
            onPress={() => onSlidePress?.(slide)}
            style={[styles.card, { width: cardW }]}
          >
            <VaultImage
              uri={slide.imageUrl}
              width={cardW}
              height={HERO_H}
              priority={slideIndex === 0 ? 'high' : 'normal'}
              contentFit="cover"
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient colors={slide.accent} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.85)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.inner}>
              <Text style={styles.kicker}>{slide.kicker}</Text>
              <Text style={styles.title} numberOfLines={2}>
                {slide.title}
              </Text>
              <View style={styles.cta}>
                <Text style={styles.ctaTxt}>{slide.cta}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {slides.map((s, i) => (
          <View key={s.id} style={[styles.dot, i === index && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  rail: { gap: GAP, paddingRight: spacing.lg },
  card: {
    height: HERO_H,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  inner: { flex: 1, justifyContent: 'flex-end', padding: spacing.md },
  kicker: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.3,
    marginTop: 4,
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
  },
  ctaTxt: { fontSize: 11, fontWeight: '800', color: colors.gold },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  dotOn: { backgroundColor: colors.gold, width: 18 },
});
